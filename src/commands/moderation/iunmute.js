const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { hasPermission, canExecuteOn } = require('../../utils/permissionUtils');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { createModerationCase } = require('../../utils/moderationUtils');
const TempMute = require('../../models/TempMute');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('iunmute')
        .setDescription('Remove the image mute role from a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to remove image mute from')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for removing image mute')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const guild = interaction.guild;
        const moderator = interaction.member;

        // Check if user is trying to iunmute themselves
        if (targetUser.id === moderator.user.id) {
            const errorEmbed = createErrorEmbed(
                'Cannot Execute Image Unmute',
                'You cannot image unmute yourself.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        try {
            const permissionCheck = await hasPermission(moderator, 'manage_messages');
            
            if (!permissionCheck.hasPermission) {
                const errorEmbed = createErrorEmbed(
                    'Insufficient Permissions',
                    permissionCheck.reason || 'You do not have permission to manage messages.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            let targetMember;
            try {
                targetMember = await guild.members.fetch(targetUser.id);
            } catch (error) {
                targetMember = null;
            }

            // Ensure we have target member and check execution rights
            if (!targetMember) {
                const errorEmbed = createErrorEmbed(
                    'User Not Found',
                    'The specified user is not a member of this server.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            const canExecute = await canExecuteOn(moderator, targetMember, 'manage_messages');
            if (!canExecute.canExecute) {
                const errorEmbed = createErrorEmbed(
                    'Cannot Image Unmute User',
                    canExecute.reason
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            const member = targetMember;

            // Check if bot can manage this user
            if (!member.manageable) {
                const errorEmbed = createErrorEmbed(
                    'Cannot Image Unmute User',
                    'I cannot manage this user. They may have a higher role than me or be the server owner.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Find the imute role
            const imuteRole = guild.roles.cache.find(role => role.name === 'imute');
            
            if (!imuteRole) {
                const errorEmbed = createErrorEmbed(
                    'Image Mute Role Not Found',
                    'The imute role does not exist. Please run the setup command first to create moderation roles.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Check if user has the imute role
            if (!member.roles.cache.has(imuteRole.id)) {
                const errorEmbed = createErrorEmbed(
                    'User Not Image Muted',
                    `${targetUser.tag} does not have the image mute role.`
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Remove the imute role
            await member.roles.remove(imuteRole, `Image unmuted by ${moderator.user.tag}: ${reason}`);

            // Remove from temp mute if exists
            await TempMute.deleteOne({
                guildId: guild.id,
                userId: targetUser.id,
                muteType: 'imute'
            });

            // Create moderation case
            const caseData = await createModerationCase({
                guildId: guild.id,
                userId: targetUser.id,
                moderatorId: moderator.user.id,
                type: 'iunmute',
                reason: reason
            });

            // Try to DM the user
            try {
                const dmEmbed = await createEmbed(guild.id, {
                    title: 'You Have Been Image Unmuted',
                    description: `Your image mute has been removed in **${guild.name}**. You can now upload files and images again.`,
                    fields: [
                        {
                            name: 'Moderator',
                            value: moderator.user.tag,
                            inline: true
                        },
                        {
                            name: 'Reason',
                            value: reason,
                            inline: true
                        },
                        {
                            name: 'Case ID',
                            value: `#${caseData.caseId}`,
                            inline: true
                        }
                    ],
                    color: 0x00FF00
                });

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                // User has DMs disabled - this is normal
            }

            // Reply with success
            const successEmbed = await createEmbed(guild.id, {
                title: 'User Image Unmuted',
                description: `Successfully removed image mute from ${targetUser.tag}`,
                fields: [
                    {
                        name: 'User',
                        value: `${targetUser.tag} (${targetUser.id})`,
                        inline: true
                    },
                    {
                        name: 'Moderator',
                        value: `${moderator.user.tag} (${moderator.user.id})`,
                        inline: true
                    },
                    {
                        name: 'Case ID',
                        value: `#${caseData.caseId}`,
                        inline: true
                    },
                    {
                        name: 'Reason',
                        value: reason,
                        inline: false
                    }
                ],
                color: 0x00FF00,
                timestamp: new Date()
            });

            await interaction.reply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('Error in iunmute command:', error);

            const errorEmbed = createErrorEmbed(
                'Failed to Image Unmute User',
                'An error occurred while trying to remove image mute from the user. Please check my permissions and try again.'
            );

            if (interaction.replied) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
