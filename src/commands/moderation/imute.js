const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { hasPermission, canExecuteOn, getLogChannel } = require('../../utils/permissionUtils');
const { createModerationCase } = require('../../utils/moderationUtils');
const TempMute = require('../../models/TempMute');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('imute')
        .setDescription('Image mute a member (remove file/attachment permissions)')
        .addUserOption(option =>
            option.setName('member')
                .setDescription('The member to image mute')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the image mute')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Duration of the image mute (e.g., 1h, 30m, 1d)')
                .setRequired(false)),
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('member');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const durationString = interaction.options.getString('duration');
        const executor = interaction.member;
        const guild = interaction.guild;
        
        // Check if user is trying to image mute themselves
        if (targetUser.id === executor.user.id) {
            const errorEmbed = createErrorEmbed(
                'Cannot Execute Image Mute',
                'You cannot image mute yourself.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check for reasonable duration limits
            const maxDuration = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
            const minDuration = 60 * 1000; // 1 minute in milliseconds
            
            if (muteDuration > maxDuration) {
                const errorEmbed = createErrorEmbed(
                    'Duration Too Long',
                    'Image mutes cannot exceed 30 days.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (muteDuration < minDuration) {
                const errorEmbed = createErrorEmbed(
                    'Duration Too Short',
                    'Image mutes must be at least 1 minute long.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            expiresAt = new Date(Date.now() + muteDuration);
        }
        
        try {
            // Check permissions
            const hasRealPermission = executor.permissions.has(PermissionFlagsBits.ManageMessages);
            const hasFakePermission = await hasPermission(executor, 'manage_messages');
            
            if (!hasRealPermission && !hasFakePermission.hasPermission) {
                const errorEmbed = createErrorEmbed(
                    'Insufficient Permissions',
                    'You do not have permission to image mute members.'
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
            }
            
            // Find the imute role
            const imuteRole = guild.roles.cache.find(role => role.name === 'imute');
            if (!imuteRole) {
                const errorEmbed = createErrorEmbed(
                    'Image Mute Role Not Found',
                    'The imute role has not been set up. Please run `/setup` first to create the moderation system.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check if user is already image muted
            if (user.roles.cache.has(imuteRole.id)) {
                const errorEmbed = createErrorEmbed(
                    'User Already Image Muted',
                    `${user.user.username} is already image muted.`
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Permission-based hierarchy and security checks
            if (hasRealPermission) {
                const executorHighestRole = executor.roles.highest;
                const targetHighestRole = targetMember.roles.highest;
                
                if (!executor.permissions.has(PermissionFlagsBits.Administrator) && 
                    targetHighestRole.position >= executorHighestRole.position) {
                    const errorEmbed = createErrorEmbed(
                        'Cannot Execute Image Mute', 
                        'You cannot image mute users with equal or higher roles.'
                    );
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            } else {
                const canExecute = await canExecuteOn(executor, targetMember, 'manage_messages');
                if (!canExecute.canExecute) {
                    const errorEmbed = createErrorEmbed('Cannot Execute Image Mute', canExecute.reason);
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            }
            
            // Execute the image mute
            await executeImageMute(interaction, guild, executor, targetMember, reason, expiresAt, durationString, imuteRole);
            
        } catch (error) {
            console.error('Error in imute command:', error);
            
            let errorMessage = 'An error occurred while trying to image mute the user.';
            
            // Handle specific Discord API errors
            if (error.code === 50013) {
                errorMessage = 'I do not have permission to image mute this user. Please check my role permissions.';
            } else if (error.code === 50001) {
                errorMessage = 'I do not have access to image mute this user.';
            } else if (error.code === 10007) {
                errorMessage = 'User not found.';
            }
            
            const errorEmbed = createErrorEmbed('Image Mute Failed', errorMessage);
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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
 * Execute the image mute action and send response
 * @param {Interaction} interaction - The slash command interaction
 * @param {Guild} guild - The guild where the image mute is happening
 * @param {GuildMember} executor - The member executing the image mute
 * @param {GuildMember} targetMember - The member being image muted
 * @param {string} reason - The reason for the image mute
 * @param {Date|null} expiresAt - When the image mute expires (null for permanent)
 * @param {string|null} durationString - Original duration string
 * @param {Role} imuteRole - The imute role to add
 */
async function executeImageMute(interaction, guild, executor, targetMember, reason, expiresAt, durationString, imuteRole) {
    // Add the imute role
    const muteReason = `Image muted by ${executor.user.tag}: ${reason}`;
    try {
        await targetMember.roles.add(imuteRole, muteReason);
    } catch (error) {
        console.error('Error adding imute role:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to Image Mute User',
            'An error occurred while trying to image mute the user. Please check my permissions and role hierarchy.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    // Store temporary image mute in database if duration is provided
    if (expiresAt) {
        await TempMute.createTempMute({
            guildId: guild.id,
            userId: targetMember.id,
            executorId: executor.user.id,
            reason: reason,
            muteDuration: durationString,
            unmuteTime: expiresAt,
            muteType: 'imute' // Store the type of mute
        });
    }
    
    // Create moderation case
    let caseId;
    try {
        const caseData = {
            guildId: guild.id,
            type: 'imute',
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
    const imuteEmbed = await createEmbed(guild.id, {
        title: 'User Image Muted',
        description: `Successfully image muted ${targetMember.user} in the server.`,
        fields: [
            {
                name: 'Image Muted User',
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
        color: 0xFF8C00 // Dark orange color for image mute
    });
    
    if (expiresAt) {
        imuteEmbed.data.fields.push({
            name: 'Duration',
            value: durationString,
            inline: true
        });
        imuteEmbed.data.fields.push({
            name: 'Expires',
            value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F> (<t:${Math.floor(expiresAt.getTime() / 1000)}:R>)`,
            inline: true
        });
    } else {
        imuteEmbed.data.fields.push({
            name: 'Duration',
            value: 'Permanent (until manually removed)',
            inline: false
        });
    }
    
    await interaction.editReply({ embeds: [imuteEmbed] });
    
    // Try to DM the user
    let dmSent = false;
    try {
        const dmEmbed = await createEmbed(guild.id, {
            title: 'You Have Been Image Muted',
            description: `You have been image muted in **${guild.name}** and cannot upload files or images.`,
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
                        'Permanent (until manually removed)',
                    inline: false
                }
            ],
            color: 0xFF8C00
        });
        
        await targetMember.user.send({ embeds: [dmEmbed] });
        dmSent = true;
    } catch (error) {
        // User has DMs disabled or we can't send DM
        dmSent = false;
    }
    
    // Log the image mute action
    await logImageMuteAction(guild, {
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
 * Log image mute action to the configured log channel
 * @param {Guild} guild - The guild where the action occurred
 * @param {Object} logData - The data to log
 */
async function logImageMuteAction(guild, logData) {
    try {
        const logChannelId = await getLogChannel(guild.id);
        if (!logChannelId) {
            console.log('Log channel not configured, skipping image mute log');
            return;
        }
        
        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) {
            console.log('Log channel not found, skipping image mute log');
            return;
        }
        
        // Create detailed log embed
        const logEmbed = await createEmbed(guild.id, {
            title: '📎 User Image Muted',
            description: `${logData.target} has been image muted in the server.`,
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
            color: 0xFF8C00
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
        console.error('Error logging image mute action:', error);
    }
}
