const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { hasPermission, canExecuteOn, getLogChannel } = require('../../utils/permissionUtils');
const { createModerationCase } = require('../../utils/moderationUtils');
const TempMute = require('../../models/TempMute');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a member (remove message permissions)')
        .addUserOption(option =>
            option.setName('member')
                .setDescription('The member to mute')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the mute')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Duration of the mute (e.g., 1h, 30m, 1d)')
                .setRequired(false)),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const targetUser = interaction.options.getUser('member');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const durationString = interaction.options.getString('duration');
        const executor = interaction.member;
        const guild = interaction.guild;
        
        // Check if user is trying to mute themselves
        if (targetUser.id === executor.user.id) {
            const errorEmbed = createErrorEmbed(
                'Cannot Execute Mute',
                'You cannot mute yourself.'
            );
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }
        
        // Parse duration if provided
        let muteDuration = null;
        let expiresAt = null;
        if (durationString) {
            muteDuration = parseTimeString(durationString);
            if (!muteDuration) {
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
            
            if (muteDuration > maxDuration) {
                const errorEmbed = createErrorEmbed(
                    'Duration Too Long',
                    'Mutes cannot exceed 30 days.'
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            if (muteDuration < minDuration) {
                const errorEmbed = createErrorEmbed(
                    'Duration Too Short',
                    'Mutes must be at least 1 minute long.'
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            expiresAt = new Date(Date.now() + muteDuration);
        }
        
        try {
            // Check permissions
            const hasRealPermission = executor.permissions.has(PermissionFlagsBits.ManageMessages) || 
                                    executor.permissions.has(PermissionFlagsBits.ModerateMembers);
            const hasFakePermission = await hasPermission(executor, 'manage_messages');
            
            if (!hasRealPermission && !hasFakePermission.hasPermission) {
                const errorEmbed = createErrorEmbed(
                    'Insufficient Permissions',
                    'You do not have permission to mute members.'
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
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
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            // Find the mute role
            const muteRole = guild.roles.cache.find(role => role.name === 'mute');
            if (!muteRole) {
                const errorEmbed = createErrorEmbed(
                    'Mute Role Not Found',
                    'The mute role has not been set up. Please run `/setup` first to create the moderation system.'
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            // Check if user is already muted
            if (targetMember.roles.cache.has(muteRole.id)) {
                const errorEmbed = createErrorEmbed(
                    'User Already Muted',
                    'This user is already muted.'
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            // Check if there's an existing temporary mute
            const existingTempMute = await TempMute.findByGuildAndUser(guild.id, targetUser.id);
            if (existingTempMute) {
                const errorEmbed = createErrorEmbed(
                    'User Already Temporarily Muted',
                    `This user is already temporarily muted until <t:${Math.floor(existingTempMute.unmuteTime.getTime() / 1000)}:F>.`
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            // Permission-based hierarchy and security checks
            if (hasRealPermission) {
                const executorHighestRole = executor.roles.highest;
                const targetHighestRole = targetMember.roles.highest;
                
                if (!executor.permissions.has(PermissionFlagsBits.Administrator) && 
                    targetHighestRole.position >= executorHighestRole.position) {
                    const errorEmbed = createErrorEmbed(
                        'Cannot Execute Mute', 
                        'You cannot mute users with equal or higher roles.'
                    );
                    await interaction.editReply({ embeds: [errorEmbed] });
                    return;
                }
            } else {
                const canExecute = await canExecuteOn(executor, targetMember, 'manage_messages');
                if (!canExecute.canExecute) {
                    const errorEmbed = createErrorEmbed('Cannot Execute Mute', canExecute.reason);
                    await interaction.editReply({ embeds: [errorEmbed] });
                    return;
                }
            }
            
            // Execute the mute
            await executeMute(interaction, guild, executor, targetMember, reason, expiresAt, durationString, muteRole);
            
        } catch (error) {
            console.error('Error in mute command:', error);
            
            let errorMessage = 'An error occurred while trying to mute the user.';
            
            // Handle specific Discord API errors
            if (error.code === 50013) {
                errorMessage = 'I do not have permission to mute this user. Please check my role permissions.';
            } else if (error.code === 50001) {
                errorMessage = 'I do not have access to mute this user.';
            } else if (error.code === 10007) {
                errorMessage = 'User not found.';
            }
            
            const errorEmbed = createErrorEmbed('Mute Failed', errorMessage);
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
 * Execute the mute action and send response
 * @param {Interaction} interaction - The slash command interaction
 * @param {Guild} guild - The guild where the mute is happening
 * @param {GuildMember} executor - The member executing the mute
 * @param {GuildMember} targetMember - The member being muted
 * @param {string} reason - The reason for the mute
 * @param {Date|null} expiresAt - When the mute expires (null for permanent)
 * @param {string|null} durationString - Original duration string
 * @param {Role} muteRole - The mute role to add
 */
async function executeMute(interaction, guild, executor, targetMember, reason, expiresAt, durationString, muteRole) {
    // Add the mute role
    const muteReason = `Muted by ${executor.user.tag}: ${reason}`;
    await targetMember.roles.add(muteRole, muteReason);
    
    // Store temporary mute in database if duration is provided
    if (expiresAt) {
        await TempMute.createTempMute({
            guildId: guild.id,
            userId: targetMember.id,
            executorId: executor.user.id,
            reason: reason,
            muteDuration: durationString,
            unmuteTime: expiresAt
        });
    }
    
    // Create moderation case
    let caseId;
    try {
        const caseData = {
            guildId: guild.id,
            type: 'mute',
            target: { id: targetMember.id, tag: targetMember.user.tag },
            executor: { id: executor.user.id, tag: executor.user.tag },
            reason: reason,
            additionalInfo: {}
        };
        
        if (expiresAt) {
            caseData.duration = durationString;
            caseData.expiresAt = expiresAt;
        }
        
        caseId = await createModerationCase(caseData);
    } catch (error) {
        console.error('Error creating moderation case:', error);
        caseId = Date.now(); // Fallback to timestamp
    }
    
    // Create success embed
    const muteEmbed = await createEmbed(guild.id, {
        title: 'User Muted',
        description: `Successfully muted ${targetMember.user} in the server.`,
        fields: [
            {
                name: 'Muted User',
                value: `${targetMember.user} (${targetMember.user.tag})`,
                inline: true
            },
            {
                name: 'Muted By',
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
            }
        ],
        color: 0xFFA500 // Orange color for mute
    });
    
    // Add duration field if applicable
    if (expiresAt) {
        muteEmbed.data.fields.push({
            name: 'Duration',
            value: durationString,
            inline: true
        });
        muteEmbed.data.fields.push({
            name: 'Expires',
            value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F> (<t:${Math.floor(expiresAt.getTime() / 1000)}:R>)`,
            inline: true
        });
    } else {
        muteEmbed.data.fields.push({
            name: 'Duration',
            value: 'Permanent (until manually unmuted)',
            inline: false
        });
    }
    
    await interaction.editReply({ embeds: [muteEmbed] });
    
    // Try to DM the user
    let dmSent = false;
    try {
        const dmEmbed = await createEmbed(guild.id, {
            title: 'You Have Been Muted',
            description: `You have been muted in **${guild.name}**.`,
            fields: [
                {
                    name: 'Reason',
                    value: reason,
                    inline: false
                },
                {
                    name: 'Duration',
                    value: expiresAt ? 
                        `${durationString} (expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>)` : 
                        'Permanent (until manually unmuted)',
                    inline: false
                }
            ],
            color: 0xFFA500
        });
        
        await targetMember.user.send({ embeds: [dmEmbed] });
        dmSent = true;
    } catch (error) {
        // User has DMs disabled or we can't send DM
        dmSent = false;
    }
    
    // Log the mute action
    await logMuteAction(guild, {
        executor: executor.user,
        target: targetMember.user,
        reason: reason,
        expiresAt: expiresAt,
        durationString: durationString,
        dmSent: dmSent,
        caseId: caseId
    });
}

/**
 * Log mute action to the configured log channel
 * @param {Guild} guild - The guild where the action occurred
 * @param {Object} logData - The data to log
 */
async function logMuteAction(guild, logData) {
    try {
        const logChannelId = await getLogChannel(guild.id);
        if (!logChannelId) {
            console.log('Log channel not configured, skipping mute log');
            return;
        }
        
        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) {
            console.log('Log channel not found, skipping mute log');
            return;
        }
        
        // Create detailed log embed
        const logEmbed = await createEmbed(guild.id, {
            title: '🔇 User Muted',
            description: `${logData.target} has been muted in the server.`,
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
                    value: logData.expiresAt ? 
                        logData.durationString : 
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
            color: 0xFFA500
        });
        
        // Add expiration field if applicable
        if (logData.expiresAt) {
            logEmbed.data.fields.splice(4, 0, {
                name: 'Expires',
                value: `<t:${Math.floor(logData.expiresAt.getTime() / 1000)}:F>`,
                inline: true
            });
        }
        
        await logChannel.send({ embeds: [logEmbed] });
        
    } catch (error) {
        console.error('Error logging mute action:', error);
    }
}
