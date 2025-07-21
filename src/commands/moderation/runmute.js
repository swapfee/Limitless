const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { hasPermission, canExecuteOn } = require('../../utils/permissionUtils');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { createModerationCase } = require('../../utils/moderationUtils');
const TempMute = require('../../models/TempMute');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('runmute')
        .setDescription('Remove the reaction mute role from a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to remove reaction mute from')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for removing reaction mute')
                .setRequired(false)
        ),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const guild = interaction.guild;
        const moderator = interaction.member;

        // Check if user is trying to runmute themselves
        if (targetUser.id === moderator.user.id) {
            const errorEmbed = createErrorEmbed(
                'Cannot Execute Reaction Unmute',
                'You cannot reaction unmute yourself.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        try {
            const hasRealPermission = moderator.permissions.has(PermissionFlagsBits.ManageMessages);
            const hasFakePermission = await hasPermission(moderator, 'manage_messages');
            
            if (!hasRealPermission && !hasFakePermission.hasPermission) {
                const errorEmbed = createErrorEmbed(
                    'Insufficient Permissions',
                    'You do not have permission to manage messages.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            let targetMember;
            try {
                targetMember = await guild.members.fetch(targetUser.id);
            } catch (error) {
                targetMember = null;
            }

            if (hasRealPermission) {
                if (targetMember) {
                    // Check if we can execute on this target with real permissions
                    const canExecute = await canExecuteOn(moderator, targetMember, 'manage_messages');
                    if (!canExecute.canExecute) {
                        const errorEmbed = createErrorEmbed(
                            'Cannot Reaction Unmute User',
                            canExecute.reason
                        );
                        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                    }
                }
            } else {
                // Using fake permissions - additional checks
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
                        'Cannot Reaction Unmute User',
                        canExecute.reason
                    );
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            }

            // Ensure we have a target member for the rest of the operation
            if (!targetMember) {
                const errorEmbed = createErrorEmbed(
                    'User Not Found',
                    'The specified user is not a member of this server.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            const member = targetMember;

            // Check if bot can manage this user
            if (!member.manageable) {
                const errorEmbed = createErrorEmbed(
                    'Cannot Reaction Unmute User',
                    'I cannot manage this user. They may have a higher role than me or be the server owner.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Find the rmute role
            const rmuteRole = guild.roles.cache.find(role => role.name === 'rmute');
            
            if (!rmuteRole) {
                const errorEmbed = createErrorEmbed(
                    'Reaction Mute Role Not Found',
                    'The rmute role does not exist. Please run the setup command first to create moderation roles.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Check if user has the rmute role
            if (!member.roles.cache.has(rmuteRole.id)) {
                const errorEmbed = createErrorEmbed(
                    'User Not Reaction Muted',
                    `${targetUser.tag} does not have the reaction mute role.`
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Remove the rmute role
            await member.roles.remove(rmuteRole, `Reaction unmuted by ${moderator.user.tag}: ${reason}`);

            // Remove from temp mute if exists
            await TempMute.deleteOne({
                guildId: guild.id,
                userId: targetUser.id,
                muteType: 'rmute'
            });

            // Create moderation case
            const caseData = await createModerationCase({
                guildId: guild.id,
                userId: targetUser.id,
                moderatorId: moderator.user.id,
                type: 'runmute',
                reason: reason
            });

            // Try to DM the user
            try {
                const dmEmbed = await createEmbed(guild.id, {
                    title: 'You Have Been Reaction Unmuted',
                    description: `Your reaction mute has been removed in **${guild.name}**. You can now add reactions again.`,
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
                title: 'User Reaction Unmuted',
                description: `Successfully removed reaction mute from ${targetUser.tag}`,
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
            console.error('Error in runmute command:', error);

            const errorEmbed = createErrorEmbed(
                'Failed to Reaction Unmute User',
                'An error occurred while trying to remove reaction mute from the user. Please check my permissions and try again.'
            );

            if (interaction.replied) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
