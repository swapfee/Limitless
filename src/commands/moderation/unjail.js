const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { hasPermission, canExecuteOn, getJailRole } = require('../../utils/permissionUtils');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { createModerationCase } = require('../../utils/moderationUtils');
const TempMute = require('../../models/TempMute');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unjail')
        .setDescription('Remove the jail role from a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to remove from jail')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for removing from jail')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const guild = interaction.guild;
        const moderator = interaction.member;

        if (targetUser.id === moderator.user.id) {
            const errorEmbed = createErrorEmbed(
                'Cannot Execute Unjail',
                'You cannot unjail yourself.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        try {
            const permissionCheck = await hasPermission(moderator, 'manage_messages');
            
            if (!permissionCheck.hasPermission) {
                const errorEmbed = createErrorEmbed(
                    'Insufficient Permissions',
                    permissionCheck.reason || 'You do not have permission to moderate members.'
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
                    'Cannot Unjail User',
                    canExecute.reason
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            const member = targetMember;

            // Check if bot can manage this user
            if (!member.manageable) {
                const errorEmbed = createErrorEmbed(
                    'Cannot Unjail User',
                    'I cannot manage this user. They may have a higher role than me or be the server owner.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Find the jail role from database
            const jailRoleId = await getJailRole(guild.id, guild);
            const jailRole = jailRoleId ? guild.roles.cache.get(jailRoleId) : null;
            
            if (!jailRole) {
                const errorEmbed = createErrorEmbed(
                    'Jail Role Not Found',
                    'The Jailed role does not exist. Please run the setup command first to create moderation roles.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Check if user has the jail role
            if (!member.roles.cache.has(jailRole.id)) {
                const errorEmbed = createErrorEmbed(
                    'User Not Jailed',
                    `${targetUser.tag} is not currently jailed.`
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }

            // Remove the jail role
            await member.roles.remove(jailRole, `Unjailed by ${moderator.user.tag}: ${reason}`);

            // Remove from temp jail if exists
            await TempMute.deleteOne({
                guildId: guild.id,
                userId: targetUser.id,
                muteType: 'jail'
            });

            // Create moderation case
            const caseData = await createModerationCase({
                guildId: guild.id,
                userId: targetUser.id,
                moderatorId: moderator.user.id,
                type: 'unjail',
                reason: reason
            });

            // Try to DM the user
            try {
                const dmEmbed = await createEmbed(guild.id, {
                    title: 'You Have Been Unjailed',
                    description: `You have been released from jail in **${guild.name}**. You can now access all channels again.`,
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
                title: 'User Unjailed',
                description: `Successfully removed ${targetUser.tag} from jail`,
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
            console.error('Error in unjail command:', error);

            const errorEmbed = createErrorEmbed(
                'Failed to Unjail User',
                'An error occurred while trying to unjail the user. Please check my permissions and try again.'
            );

            if (interaction.replied) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
