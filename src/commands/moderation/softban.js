const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { hasPermission, canExecuteOn } = require('../../utils/permissionUtils');
const { createModerationCase } = require('../../utils/moderationUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('softban')
        .setDescription('Softbans a member (ban then unban to delete messages)')
        .addUserOption(option =>
            option
                .setName('member')
                .setDescription('The member to softban')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('delete_history')
                .setDescription('Days of messages to delete (0-7)')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(7)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the softban')
                .setRequired(false)
                .setMaxLength(512)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('member');
        const deleteHistory = interaction.options.getInteger('delete_history') ?? 1; // Default 1 day
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const executor = interaction.member;
        const guild = interaction.guild;
        
        // Check if user is trying to softban themselves
        if (targetUser.id === executor.user.id) {
            const errorEmbed = createErrorEmbed(
                'Cannot Execute Softban',
                'You cannot softban yourself.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        
        try {
            const permissionCheck = await hasPermission(executor, 'ban_members');
            
            if (!permissionCheck.hasPermission) {
                const errorEmbed = createErrorEmbed(
                    'Insufficient Permissions',
                    permissionCheck.reason || 'You do not have permission to ban members.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            let targetMember;
            try {
                targetMember = await guild.members.fetch(targetUser.id);
            } catch (error) {
                targetMember = null;
            }
            
            if (targetMember) {
                // Check if user can execute on target using hierarchy and permission rules
                const canExecute = await canExecuteOn(executor, targetMember, 'ban_members');
                if (!canExecute.canExecute) {
                    const errorEmbed = createErrorEmbed(
                        'Cannot Execute Softban',
                        canExecute.reason
                    );
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
                
                // Check if bot can ban the target (bot's role hierarchy)
                if (targetMember.roles.highest.position >= guild.members.me.roles.highest.position) {
                    const errorEmbed = createErrorEmbed(
                        'Cannot Execute Softban',
                        'I cannot softban someone with an equal or higher role than me.'
                    );
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
                
                // Check if target is bannable
                if (!targetMember.bannable) {
                    const errorEmbed = createErrorEmbed(
                        'Cannot Execute Softban',
                        'I cannot softban this user. They may have higher permissions than me.'
                    );
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                    return;
                }
            }
            
            // Check if user is trying to softban the bot
            if (targetUser.id === interaction.client.user.id) {
                const errorEmbed = createErrorEmbed(
                    'Cannot Execute Softban',
                    'I cannot softban myself.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }

            // Try to send DM to user before softbanning
            let dmSent = false;
            try {
                const dmEmbed = createEmbed(
                    'You have been softbanned',
                    `**Server:** ${guild.name}\n**Reason:** ${reason}\n**Moderator:** ${executor.user.tag}\n\n*Note: This is a softban - you can rejoin the server immediately.*`,
                    'warning'
                );
                await targetUser.send({ embeds: [dmEmbed] });
                dmSent = true;
            } catch (error) {
                // User has DMs disabled or blocked the bot
                dmSent = false;
            }

            // Perform the softban (ban then unban)
            const fullReason = `Softban by ${executor.user.tag} | ${reason}`;
            
            // Ban the user
            await guild.bans.create(targetUser.id, { 
                deleteMessageDays: deleteHistory, 
                reason: fullReason 
            });

            // Immediately unban the user
            await guild.bans.remove(targetUser.id, `Softban unban by ${executor.user.tag} | ${reason}`);

            // Create moderation case
            let caseId;
            try {
                caseId = await createModerationCase({
                    guildId: guild.id,
                    type: 'softban',
                    target: { id: targetUser.id, tag: targetUser.tag },
                    executor: { id: executor.user.id, tag: executor.user.tag },
                    reason: reason,
                    additionalInfo: {
                        deleteMessages: true,
                        deleteMessageDays: deleteHistory,
                        dmSent: dmSent
                    }
                });
            } catch (error) {
                console.error('Error creating moderation case:', error);
                caseId = Date.now(); // Fallback to timestamp
            }

            // Create success embed
            const successEmbed = createEmbed(
                'Member Softbanned',
                `**User:** ${targetUser.tag} (${targetUser.id})\n**Moderator:** ${executor.user.tag}\n**Case ID:** #${caseId}\n**Reason:** ${reason}\n**Messages Deleted:** ${deleteHistory} day(s)\n**DM Sent:** ${dmSent ? 'Yes' : 'No'}`,
                'success'
            );

            await interaction.reply({ embeds: [successEmbed] });

            // Log to jail-log channel if it exists
            const GuildConfig = require('../../models/GuildConfig');
            const guildConfig = await GuildConfig.findOne({ guildId: guild.id });
            
            if (guildConfig && guildConfig.jailLogChannelId) {
                const logChannel = guild.channels.cache.get(guildConfig.jailLogChannelId);
                if (logChannel) {
                    const logEmbed = createEmbed(
                        'Member Softbanned',
                        `**User:** ${targetUser.tag} (${targetUser.id})\n**Moderator:** ${executor.user.tag} (${executor.id})\n**Case ID:** #${caseId}\n**Reason:** ${reason}\n**Messages Deleted:** ${deleteHistory} day(s)\n**DM Sent:** ${dmSent ? 'Yes' : 'No'}\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`,
                        'warning'
                    );
                    
                    try {
                        await logChannel.send({ embeds: [logEmbed] });
                    } catch (error) {
                        console.error('Failed to send softban log:', error);
                    }
                }
            }

        } catch (error) {
            console.error('Error in softban command:', error);
            
            const errorEmbed = createErrorEmbed(
                'Command Error',
                'An error occurred while trying to softban the user. Please try again.'
            );

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },
};
