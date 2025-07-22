const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { hasPermission, canExecuteOn, getLogChannel } = require('../../utils/permissionUtils');
const { createModerationCase } = require('../../utils/moderationUtils');
const TempMute = require('../../models/TempMute');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rmute')
        .setDescription('Reaction mute a member (remove reaction permissions)')
        .addUserOption(option =>
            option.setName('member')
                .setDescription('The member to reaction mute')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the reaction mute')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Duration of the reaction mute (e.g., 1h, 30m, 1d)')
                .setRequired(false)),
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('member');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const durationString = interaction.options.getString('duration');
        const executor = interaction.member;
        const guild = interaction.guild;
        
        // Check if user is trying to reaction mute themselves
        if (targetUser.id === executor.user.id) {
            const errorEmbed = createErrorEmbed(
                'Cannot Execute Reaction Mute',
                'You cannot reaction mute yourself.'
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
                return;
            }
            
            // Check for reasonable duration limits
            const maxDuration = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
            const minDuration = 60 * 1000; // 1 minute in milliseconds
            
            if (muteDuration > maxDuration) {
                const errorEmbed = createErrorEmbed(
                    'Duration Too Long',
                    'Reaction mutes cannot exceed 30 days.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }
            
            if (muteDuration < minDuration) {
                const errorEmbed = createErrorEmbed(
                    'Duration Too Short',
                    'Reaction mutes must be at least 1 minute long.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }
            
            expiresAt = new Date(Date.now() + muteDuration);
        }
        
        try {
            // Check permissions
            const permissionCheck = await hasPermission(executor, 'manage_messages');
            
            if (!permissionCheck.hasPermission) {
                const errorEmbed = createErrorEmbed(
                    'Insufficient Permissions',
                    permissionCheck.reason || 'You do not have permission to reaction mute members.'
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
            
            // Find the rmute role
            const rmuteRole = guild.roles.cache.find(role => role.name === 'rmute');
            if (!rmuteRole) {
                const errorEmbed = createErrorEmbed(
                    'Reaction Mute Role Not Found',
                    'The rmute role has not been set up. Please run `/setup` first to create the moderation system.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }
            
            // Check if user is already reaction muted
            if (targetMember.roles.cache.has(rmuteRole.id)) {
                const errorEmbed = createErrorEmbed(
                    'User Already Reaction Muted',
                    'This user is already reaction muted.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                return;
            }
            
            // Check execution rights
            const canExecute = await canExecuteOn(executor, targetMember, 'manage_messages');
            if (!canExecute.canExecute) {
                const errorEmbed = createErrorEmbed('Cannot Execute Reaction Mute', canExecute.reason);
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Execute the reaction mute
            await executeReactionMute(interaction, guild, executor, targetMember, reason, expiresAt, durationString, rmuteRole);
            
        } catch (error) {
            console.error('Error in rmute command:', error);
            
            let errorMessage = 'An error occurred while trying to reaction mute the user.';
            
            // Handle specific Discord API errors
            if (error.code === 50013) {
                errorMessage = 'I do not have permission to reaction mute this user. Please check my role permissions.';
            } else if (error.code === 50001) {
                errorMessage = 'I do not have access to reaction mute this user.';
            } else if (error.code === 10007) {
                errorMessage = 'User not found.';
            }
            
            const errorEmbed = createErrorEmbed('Reaction Mute Failed', errorMessage);
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
 * Execute the reaction mute action and send response
 * @param {Interaction} interaction - The slash command interaction
 * @param {Guild} guild - The guild where the reaction mute is happening
 * @param {GuildMember} executor - The member executing the reaction mute
 * @param {GuildMember} targetMember - The member being reaction muted
 * @param {string} reason - The reason for the reaction mute
 * @param {Date|null} expiresAt - When the reaction mute expires (null for permanent)
 * @param {string|null} durationString - Original duration string
 * @param {Role} rmuteRole - The rmute role to add
 */
async function executeReactionMute(interaction, guild, executor, targetMember, reason, expiresAt, durationString, rmuteRole) {
    // Add the rmute role
    const muteReason = `Reaction muted by ${executor.user.tag}: ${reason}`;
    await targetMember.roles.add(rmuteRole, muteReason);
    
    // Store temporary reaction mute in database if duration is provided
    if (expiresAt) {
        await TempMute.createTempMute({
            guildId: guild.id,
            userId: targetMember.id,
            executorId: executor.user.id,
            reason: reason,
            muteDuration: durationString,
            unmuteTime: expiresAt,
            muteType: 'rmute' // Store the type of mute
        });
    }
    
    // Create moderation case
    let caseId;
    try {
        const caseData = {
            guildId: guild.id,
            type: 'rmute',
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
    const rmuteEmbed = await createEmbed(guild.id, {
        title: 'User Reaction Muted',
        description: `Successfully reaction muted ${targetMember.user} in the server.`,
        fields: [
            {
                name: 'Reaction Muted User',
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
        color: 0xFFD700 // Gold color for reaction mute
    });
    
    if (expiresAt) {
        rmuteEmbed.data.fields.push({
            name: 'Duration',
            value: durationString,
            inline: true
        });
        rmuteEmbed.data.fields.push({
            name: 'Expires',
            value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F> (<t:${Math.floor(expiresAt.getTime() / 1000)}:R>)`,
            inline: true
        });
    } else {
        rmuteEmbed.data.fields.push({
            name: 'Duration',
            value: 'Permanent (until manually removed)',
            inline: false
        });
    }
    
    await interaction.reply({ embeds: [rmuteEmbed] });
    
    // Try to DM the user
    let dmSent = false;
    try {
        const dmEmbed = await createEmbed(guild.id, {
            title: 'You Have Been Reaction Muted',
            description: `You have been reaction muted in **${guild.name}** and cannot add reactions to messages.`,
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
            color: 0xFFD700
        });
        
        await targetMember.user.send({ embeds: [dmEmbed] });
        dmSent = true;
    } catch (error) {
        // User has DMs disabled or we can't send DM
        dmSent = false;
    }
    
    // Log the reaction mute action
    await logReactionMuteAction(guild, {
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
 * Log reaction mute action to the configured log channel
 * @param {Guild} guild - The guild where the action occurred
 * @param {Object} logData - The data to log
 */
async function logReactionMuteAction(guild, logData) {
    try {
        const logChannelId = await getLogChannel(guild.id);
        if (!logChannelId) {
            console.log('Log channel not configured, skipping reaction mute log');
            return;
        }
        
        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) {
            console.log('Log channel not found, skipping reaction mute log');
            return;
        }
        
        // Create detailed log embed
        const logEmbed = await createEmbed(guild.id, {
            title: '😶 User Reaction Muted',
            description: `${logData.target} has been reaction muted in the server.`,
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
            color: 0xFFD700
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
        console.error('Error logging reaction mute action:', error);
    }
}
