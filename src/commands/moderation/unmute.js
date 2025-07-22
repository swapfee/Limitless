const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { hasPermission, canExecuteOn, getLogChannel } = require('../../utils/permissionUtils');
const { createModerationCase } = require('../../utils/moderationUtils');
const TempMute = require('../../models/TempMute');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute a member (restore message permissions)')
        .addUserOption(option =>
            option.setName('member')
                .setDescription('The member to unmute')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the unmute')
                .setRequired(false)),
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('member');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const executor = interaction.member;
        const guild = interaction.guild;
        
        try {
            // Check permissions
            const permissionCheck = await hasPermission(executor, 'manage_messages');
            
            if (!permissionCheck.hasPermission) {
                const errorEmbed = createErrorEmbed(
                    'Insufficient Permissions',
                    permissionCheck.reason || 'You do not have permission to unmute members.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Try to fetch the target member
            let targetMember;
            try {
                targetMember = await guild.members.fetch(targetUser.id);
            } catch (error) {
                const errorEmbed = createErrorEmbed(
                    'User Not Found',
                    'The specified user is not a member of this server.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }
            
            // Find the mute role
            const muteRole = guild.roles.cache.find(role => role.name === 'mute');
            if (!muteRole) {
                const errorEmbed = createErrorEmbed(
                    'Mute Role Not Found',
                    'The mute role has not been set up. Please run `/setup` first to create the moderation system.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }
            
            // Check if user is actually muted
            if (!targetMember.roles.cache.has(muteRole.id)) {
                const errorEmbed = createErrorEmbed(
                    'User Not Muted',
                    'This user is not currently muted.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }
            
            // Check execution rights
            const canExecute = await canExecuteOn(executor, targetMember, 'manage_messages');
            if (!canExecute.canExecute) {
                const errorEmbed = createErrorEmbed('Cannot Execute Unmute', canExecute.reason);
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Execute the unmute
            await executeUnmute(interaction, guild, executor, targetMember, reason, muteRole);
            
        } catch (error) {
            console.error('Error in unmute command:', error);
            
            let errorMessage = 'An error occurred while trying to unmute the user.';
            
            // Handle specific Discord API errors
            if (error.code === 50013) {
                errorMessage = 'I do not have permission to unmute this user. Please check my role permissions.';
            } else if (error.code === 50001) {
                errorMessage = 'I do not have access to unmute this user.';
            } else if (error.code === 10007) {
                errorMessage = 'User not found.';
            }
            
            const errorEmbed = createErrorEmbed('Unmute Failed', errorMessage);
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
};

/**
 * Execute the unmute action and send response
 * @param {Interaction} interaction - The slash command interaction
 * @param {Guild} guild - The guild where the unmute is happening
 * @param {GuildMember} executor - The member executing the unmute
 * @param {GuildMember} targetMember - The member being unmuted
 * @param {string} reason - The reason for the unmute
 * @param {Role} muteRole - The mute role to remove
 */
async function executeUnmute(interaction, guild, executor, targetMember, reason, muteRole) {
    // Check if there was a temporary mute and get its info for logging
    const existingTempMute = await TempMute.findByGuildAndUser(guild.id, targetMember.id);
    let originalExpiration = null;
    let originalDuration = null;
    
    if (existingTempMute) {
        originalExpiration = existingTempMute.unmuteTime;
        originalDuration = existingTempMute.muteDuration;
        // Remove from database since we're manually unmuting
        await TempMute.removeTempMute(guild.id, targetMember.id);
    }
    
    // Remove the mute role
    const unmuteReason = `Unmuted by ${executor.user.tag}: ${reason}`;
    await targetMember.roles.remove(muteRole, unmuteReason);
    
    // Create moderation case
    let caseId;
    try {
        caseId = await createModerationCase({
            guildId: guild.id,
            type: 'unmute',
            target: { id: targetMember.id, tag: targetMember.user.tag },
            executor: { id: executor.user.id, tag: executor.user.tag },
            reason: reason,
            additionalInfo: {
                originalExpiration: originalExpiration,
                originalDuration: originalDuration
            }
        });
    } catch (error) {
        console.error('Error creating moderation case:', error);
        caseId = Date.now(); // Fallback to timestamp
    }
    
    // Create success embed
    const unmuteEmbed = await createEmbed(guild.id, {
        title: 'User Unmuted',
        description: `Successfully unmuted ${targetMember.user} in the server.`,
        fields: [
            {
                name: 'Unmuted User',
                value: `${targetMember.user} (${targetMember.user.tag})`,
                inline: true
            },
            {
                name: 'Unmuted By',
                value: `${executor.user} (${executor.user.tag})`,
                inline: true
            },
            {
                name: 'Case ID',
                value: `#${caseId}`,
                inline: true
            },
            {
                name: 'Reason',
                value: reason,
                inline: false
            },
            {
                name: 'Original Expiration',
                value: originalExpiration ? 
                    `<t:${Math.floor(originalExpiration.getTime() / 1000)}:F>` : 
                    'Permanent',
                inline: true
            },
            {
                name: 'Original Duration',
                value: originalDuration || 'Permanent',
                inline: true
            }
        ],
        color: 0x00FF00 // Green color for unmute
    });
    
    await interaction.reply({ embeds: [unmuteEmbed] });
    
    // Try to DM the user
    let dmSent = false;
    try {
        const dmEmbed = await createEmbed(guild.id, {
            title: 'You Have Been Unmuted',
            description: `You have been unmuted in **${guild.name}** and can now send messages again.`,
            fields: [
                {
                    name: 'Reason',
                    value: reason,
                    inline: false
                }
            ],
            color: 0x00FF00
        });
        
        await targetMember.user.send({ embeds: [dmEmbed] });
        dmSent = true;
    } catch (error) {
        // User has DMs disabled or we can't send DM
        dmSent = false;
    }
    
    // Log the unmute action
    await logUnmuteAction(guild, {
        executor: executor.user,
        target: targetMember.user,
        reason: reason,
        originalExpiration: originalExpiration,
        originalDuration: originalDuration,
        dmSent: dmSent,
        caseId: caseId
    });
}

/**
 * Log unmute action to the configured log channel
 * @param {Guild} guild - The guild where the action occurred
 * @param {Object} logData - The data to log
 */
async function logUnmuteAction(guild, logData) {
    try {
        const logChannelId = await getLogChannel(guild.id);
        if (!logChannelId) {
            console.log('Log channel not configured, skipping unmute log');
            return;
        }
        
        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) {
            console.log('Log channel not found, skipping unmute log');
            return;
        }
        
        // Create detailed log embed
        const logEmbed = await createEmbed(guild.id, {
            title: '🔊 User Unmuted',
            description: `${logData.target} has been unmuted in the server.`,
            fields: [
                {
                    name: 'Target',
                    value: `${logData.target} (${logData.target.tag})`,
                    inline: true
                },
                {
                    name: 'Moderator',
                    value: `${logData.executor} (${logData.executor.tag})`,
                    inline: true
                },
                {
                    name: 'Case ID',
                    value: `#${logData.caseId}`,
                    inline: true
                },
                {
                    name: 'Original Duration',
                    value: logData.originalDuration || 'Permanent',
                    inline: true
                },
                {
                    name: 'Original Expiration',
                    value: logData.originalExpiration ? 
                        `<t:${Math.floor(logData.originalExpiration.getTime() / 1000)}:F>` : 
                        'Permanent',
                    inline: true
                },
                {
                    name: 'DM Sent',
                    value: logData.dmSent ? 'Yes' : 'No',
                    inline: true
                },
                {
                    name: 'Reason',
                    value: logData.reason,
                    inline: false
                }
            ],
            footer: {
                text: `User ID: ${logData.target.id} • Moderator ID: ${logData.executor.id}`
            },
            timestamp: new Date(),
            color: 0x00FF00
        });
        
        await logChannel.send({ embeds: [logEmbed] });
        
    } catch (error) {
        console.error('Error logging unmute action:', error);
    }
}
