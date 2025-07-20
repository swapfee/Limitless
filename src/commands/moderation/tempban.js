const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { hasPermission, canExecuteOn } = require('../../utils/permissionUtils');
const { createModerationCase } = require('../../utils/moderationUtils');
const TempBan = require('../../models/TempBan');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tempban')
        .setDescription('Temporarily ban members')
        .addUserOption(option =>
            option.setName('member')
                .setDescription('The member to temporarily ban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Duration of the ban (e.g., 1h, 30m, 1d, 7d)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the temporary ban')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('delete_messages')
                .setDescription('Delete messages from the user (last 7 days)')
                .setRequired(false)),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const targetUser = interaction.options.getUser('member');
        const timeString = interaction.options.getString('time');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const deleteMessages = interaction.options.getBoolean('delete_messages') ?? false;
        const executor = interaction.member;
        const guild = interaction.guild;
        
        // Check if user is trying to tempban themselves
        if (targetUser.id === executor.user.id) {
            const errorEmbed = createErrorEmbed(
                'Cannot Execute Tempban',
                'You cannot temporarily ban yourself.'
            );
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        
        // Parse the time duration
        const banDuration = parseTimeString(timeString);
        if (!banDuration) {
            const errorEmbed = createErrorEmbed(
                'Invalid Time Format',
                'Please use a valid time format (e.g., 1h, 30m, 1d, 7d).\nSupported units: s (seconds), m (minutes), h (hours), d (days)'
            );
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        
        // Check for reasonable duration limits
        const maxDuration = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
        const minDuration = 60 * 1000; // 1 minute in milliseconds
        
        if (banDuration > maxDuration) {
            const errorEmbed = createErrorEmbed(
                'Duration Too Long',
                'Temporary bans cannot exceed 30 days. Use the regular ban command for permanent bans.'
            );
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        
        if (banDuration < minDuration) {
            const errorEmbed = createErrorEmbed(
                'Duration Too Short',
                'Temporary bans must be at least 1 minute long.'
            );
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        
        try {
            // Check if user is already temporarily banned
            const existingBan = await TempBan.findOne({ 
                guildId: guild.id, 
                userId: targetUser.id 
            });
            
            if (existingBan) {
                const errorEmbed = createErrorEmbed(
                    'User Already Temporarily Banned',
                    `This user is already temporarily banned. They will be automatically unbanned <t:${Math.floor(existingBan.unbanTime.getTime() / 1000)}:R>.`
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            // Check permissions (same logic as ban command)
            const hasRealPermission = executor.permissions.has(PermissionFlagsBits.BanMembers);
            const hasFakePermission = await hasPermission(executor, 'ban_members');
            
            if (!hasRealPermission && !hasFakePermission.hasPermission) {
                const errorEmbed = createErrorEmbed(
                    'Insufficient Permissions',
                    'You do not have permission to ban members.'
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            // Try to fetch the target member
            let targetMember;
            try {
                targetMember = await guild.members.fetch(targetUser.id);
            } catch (error) {
                // User might not be in the server, but we can still ban by ID
                targetMember = null;
            }
            
            // Permission-based hierarchy and security checks
            if (hasRealPermission) {
                if (targetMember) {
                    const executorHighestRole = executor.roles.highest;
                    const targetHighestRole = targetMember.roles.highest;
                    
                    if (!executor.permissions.has(PermissionFlagsBits.Administrator) && 
                        targetHighestRole.position >= executorHighestRole.position) {
                        const errorEmbed = createErrorEmbed(
                            'Cannot Execute Tempban', 
                            'You cannot temporarily ban users with equal or higher roles.'
                        );
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }
                }
            } else {
                if (targetMember) {
                    const canExecute = await canExecuteOn(executor, targetMember, 'ban_members');
                    if (!canExecute.canExecute) {
                        const errorEmbed = createErrorEmbed('Cannot Execute Tempban', canExecute.reason);
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }
                }
            }
            
            // Execute the temporary ban
            await executeTempBan(interaction, guild, executor, targetUser, reason, deleteMessages, banDuration, timeString);
            
        } catch (error) {
            console.error('Error in tempban command:', error);
            
            let errorMessage = 'An error occurred while trying to temporarily ban the user.';
            
            // Handle specific Discord API errors
            if (error.code === 50013) {
                errorMessage = 'I do not have permission to ban this user. Please check my role permissions.';
            } else if (error.code === 50001) {
                errorMessage = 'I do not have access to ban this user.';
            } else if (error.code === 10007) {
                errorMessage = 'User not found.';
            } else if (error.code === 10013) {
                errorMessage = 'User is already banned or invalid user ID.';
            }
            
            const errorEmbed = createErrorEmbed('Tempban Failed', errorMessage);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};

/**
 * Parse time string into milliseconds
 * @param {string} timeString - Time string (e.g., "1h", "30m", "1d")
 * @returns {number|null} - Duration in milliseconds or null if invalid
 */
function parseTimeString(timeString) {
    const regex = /^(\d+)([smhd])$/i;
    const match = timeString.match(regex);
    
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const multipliers = {
        s: 1000,                    // seconds
        m: 60 * 1000,              // minutes
        h: 60 * 60 * 1000,         // hours
        d: 24 * 60 * 60 * 1000     // days
    };
    
    return value * multipliers[unit];
}

/**
 * Format milliseconds into human-readable time
 * @param {number} ms - Milliseconds
 * @returns {string} - Formatted time string
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

/**
 * Execute the temporary ban action and send response
 * @param {Interaction} interaction - The slash command interaction
 * @param {Guild} guild - The guild where the ban is happening
 * @param {GuildMember} executor - The member executing the ban
 * @param {User} targetUser - The user being banned
 * @param {string} reason - The reason for the ban
 * @param {boolean} deleteMessages - Whether to delete messages
 * @param {number} banDuration - Duration in milliseconds
 * @param {string} timeString - Original time string
 */
async function executeTempBan(interaction, guild, executor, targetUser, reason, deleteMessages, banDuration, timeString) {
    // Execute the ban
    const banOptions = {
        reason: `Temporarily banned by ${executor.user.tag} for ${timeString}: ${reason}`,
        deleteMessageSeconds: deleteMessages ? 7 * 24 * 60 * 60 : 0 // 7 days in seconds
    };
    
    await guild.members.ban(targetUser, banOptions);
    
    // Calculate unban time
    const unbanTime = Date.now() + banDuration;
    
    // Store tempban in database for persistence across bot restarts
    await TempBan.createTempBan({
        guildId: guild.id,
        userId: targetUser.id,
        executorId: executor.user.id,
        reason: reason,
        banDuration: timeString,
        unbanTime: new Date(unbanTime),
        deleteMessages: deleteMessages
    });
    
    // Create moderation case
    let caseId;
    try {
        caseId = await createModerationCase({
            guildId: guild.id,
            type: 'tempban',
            target: { id: targetUser.id, tag: targetUser.tag },
            executor: { id: executor.user.id, tag: executor.user.tag },
            reason: reason,
            duration: timeString,
            expiresAt: new Date(unbanTime),
            additionalInfo: {
                deleteMessages: deleteMessages
            }
        });
    } catch (error) {
        console.error('Error creating moderation case:', error);
        caseId = Date.now(); // Fallback to timestamp
    }
    
    // Create success embed
    const tempbanEmbed = await createEmbed(guild.id, {
        title: 'User Temporarily Banned',
        description: `Successfully temporarily banned ${targetUser} from the server.`,
        fields: [
            {
                name: 'Banned User',
                value: `${targetUser} (${targetUser.tag})`,
                inline: true
            },
            {
                name: 'Banned By',
                value: `${executor.user} (${executor.user.tag})`,
                inline: true
            },
            {
                name: 'Case ID',
                value: `#${caseId}`,
                inline: true
            },
            {
                name: 'Duration',
                value: `${formatDuration(banDuration)} (${timeString})`,
                inline: true
            },
            {
                name: 'Reason',
                value: reason,
                inline: false
            },
            {
                name: 'Unban Time',
                value: `<t:${Math.floor(unbanTime / 1000)}:F> (<t:${Math.floor(unbanTime / 1000)}:R>)`,
                inline: true
            },
            {
                name: 'Message Deletion',
                value: deleteMessages ? 'Last 7 days deleted' : 'No messages deleted',
                inline: true
            }
        ]
    });
    
    await interaction.editReply({ embeds: [tempbanEmbed] });
    
    // Log to jail-log channel
    await logTempBanAction(guild, {
        executor: executor.user,
        target: targetUser,
        reason: reason,
        banDuration: timeString,
        unbanTime: unbanTime,
        deleteMessages: deleteMessages,
        timestamp: Date.now(),
        caseId: caseId
    });
}

/**
 * Log tempban action to jail-log channel
 * @param {Guild} guild - The guild where the action occurred
 * @param {Object} logData - The data to log
 */
async function logTempBanAction(guild, logData) {
    try {
        const logChannelId = await getLogChannel(guild.id);
        if (!logChannelId) {
            console.log('Log channel not configured, skipping tempban log');
            return;
        }
        
        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) {
            console.log('Log channel not found, skipping tempban log');
            return;
        }
        
        // Create detailed log embed
        const logEmbed = await createEmbed(guild.id, {
            title: '🔨 Temporary Ban',
            description: `${logData.target} has been temporarily banned from the server.`,
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
                    name: 'Duration',
                    value: logData.banDuration,
                    inline: true
                },
                {
                    name: 'Expires',
                    value: `<t:${Math.floor(logData.unbanTime / 1000)}:F>`,
                    inline: true
                },
                {
                    name: 'Messages Deleted',
                    value: logData.deleteMessages ? '7 days' : 'None',
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
            color: 0xFF6B6B
        });
        
        await logChannel.send({ embeds: [logEmbed] });
        
    } catch (error) {
        console.error('Error logging tempban action:', error);
    }
}
