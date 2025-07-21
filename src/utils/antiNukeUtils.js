const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('./embedUtils');
const { getAntiNukeLogChannel } = require('./permissionUtils');
const { jailMember } = require('./moderationUtils');
const AntiNukeLog = require('../models/AntiNukeLog');

/**
 * Execute punishment for antinuke violations
 * @param {Guild} guild - The guild where the violation occurred
 * @param {User} violator - The user who violated antinuke limits
 * @param {AntiNukeConfig} config - The antinuke configuration
 * @param {string} actionType - The type of action that triggered the violation
 * @param {Object} context - Additional context about the violation
 */
async function executeAntiNukePunishment(guild, violator, config, actionType, context) {
    try {
        // Get the violator as a guild member
        let violatorMember;
        try {
            violatorMember = await guild.members.fetch(violator.id);
        } catch (error) {
            console.log(`[AntiNuke] Cannot fetch member ${violator.tag} - they may have left the server`);
            return;
        }
        
        // Check if violator is still in the server and can be punished
        if (!violatorMember) {
            console.log(`[AntiNuke] Violator ${violator.tag} is no longer in the server`);
            return;
        }
        
        // Check if violator has higher permissions than the bot
        const botMember = await guild.members.fetch(guild.client.user.id);
        if (violatorMember.roles.highest.position >= botMember.roles.highest.position) {
            console.log(`[AntiNuke] Cannot punish ${violator.tag} - they have higher or equal role hierarchy`);
            await logPunishmentFailure(guild, violator, config, actionType, context, 'Higher role hierarchy');
            return;
        }
        
        const punishmentType = config.punishment.type;
        let punishmentResult = { success: false, action: 'none', reason: 'No punishment configured' };
        
        // Execute the configured punishment
        switch (punishmentType) {
            case 'kick':
                punishmentResult = await executeKick(guild, violatorMember, context);
                break;
                
            case 'ban':
                punishmentResult = await executeBan(guild, violatorMember, context);
                break;
                
            case 'strip_permissions':
                punishmentResult = await executeStripPermissions(guild, violatorMember, config, context);
                break;
                
            case 'jail':
                punishmentResult = await executeJail(guild, violatorMember, config, context);
                break;
                
            case 'jail_and_strip':
                const jailResult = await executeJail(guild, violatorMember, config, context);
                const stripResult = await executeStripPermissions(guild, violatorMember, config, context);
                punishmentResult = {
                    success: jailResult.success && stripResult.success,
                    action: 'jail_and_strip',
                    reason: `Jail: ${jailResult.reason}, Strip: ${stripResult.reason}`
                };
                break;
                
            default:
                console.log(`[AntiNuke] No punishment configured for violation by ${violator.tag}`);
                break;
        }
        
        // Log the punishment
        await AntiNukeLog.logPunishment(guild.id, violator.id, actionType, punishmentType, {
            ...context,
            punishmentSuccess: punishmentResult.success,
            punishmentReason: punishmentResult.reason
        });
        
        // Send notification to log channel
        await logPunishmentExecution(guild, violator, config, actionType, context, punishmentResult);
        
        // Notify the user if configured
        if (config.punishment.notifyUser && punishmentResult.success) {
            await notifyPunishedUser(violatorMember, guild, actionType, context, punishmentResult);
        }
        
        console.log(`[AntiNuke] Executed ${punishmentType} punishment for ${violator.tag} in ${guild.name}`);
        
    } catch (error) {
        console.error('Error executing antinuke punishment:', error);
        await logPunishmentFailure(guild, violator, config, actionType, context, error.message);
    }
}

/**
 * Execute kick punishment
 */
async function executeKick(guild, member, context) {
    try {
        const reason = `AntiNuke: Excessive ${context.triggerAction} (${context.actionCount}/${context.limit})`;
        await member.kick(reason);
        return { success: true, action: 'kick', reason: 'Successfully kicked' };
    } catch (error) {
        console.error('Failed to kick member:', error);
        return { success: false, action: 'kick', reason: error.message };
    }
}

/**
 * Execute ban punishment
 */
async function executeBan(guild, member, context) {
    try {
        const reason = `AntiNuke: Excessive ${context.triggerAction} (${context.actionCount}/${context.limit})`;
        await member.ban({ reason, deleteMessageDays: 1 });
        return { success: true, action: 'ban', reason: 'Successfully banned' };
    } catch (error) {
        console.error('Failed to ban member:', error);
        return { success: false, action: 'ban', reason: error.message };
    }
}

/**
 * Execute strip permissions punishment
 */
async function executeStripPermissions(guild, member, config, context) {
    try {
        // Define dangerous permissions to remove
        const dangerousPermissions = [
            PermissionFlagsBits.Administrator,
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.KickMembers,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.ManageWebhooks,
            PermissionFlagsBits.ManageEmojisAndStickers,
            PermissionFlagsBits.ManageNicknames,
            PermissionFlagsBits.MentionEveryone,
            PermissionFlagsBits.ViewAuditLog,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.DeafenMembers,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.ManageEvents,
            PermissionFlagsBits.ManageThreads,
            PermissionFlagsBits.CreateInstantInvite
        ];
        
        let removedRoles = [];
        let strippedPermissions = [];
        
        // Remove roles that have dangerous permissions
        for (const role of member.roles.cache.values()) {
            if (role.id === guild.id) continue; // Skip @everyone role
            
            // Check if role has any dangerous permissions
            const roleDangerousPerms = dangerousPermissions.filter(perm => role.permissions.has(perm));
            
            if (roleDangerousPerms.length > 0) {
                try {
                    await member.roles.remove(role, `AntiNuke: Strip dangerous permissions - ${context.triggerAction}`);
                    removedRoles.push(role.name);
                    
                    // Log which specific permissions were removed
                    const permNames = roleDangerousPerms.map(perm => {
                        const permName = Object.keys(PermissionFlagsBits).find(key => PermissionFlagsBits[key] === perm);
                        return permName;
                    }).filter(Boolean);
                    strippedPermissions.push(...permNames);
                    
                } catch (roleError) {
                    console.error(`Failed to remove role ${role.name} from ${member.user.tag}:`, roleError);
                }
            }
        }
        
        if (removedRoles.length > 0) {
            const uniquePermissions = [...new Set(strippedPermissions)];
            return { 
                success: true, 
                action: 'strip_permissions', 
                reason: `Removed ${removedRoles.length} dangerous roles (${removedRoles.join(', ')}) containing permissions: ${uniquePermissions.join(', ')}` 
            };
        } else {
            return { 
                success: true, 
                action: 'strip_permissions', 
                reason: 'No dangerous roles found to remove' 
            };
        }
    } catch (error) {
        console.error('Failed to strip permissions:', error);
        return { success: false, action: 'strip_permissions', reason: error.message };
    }
}

/**
 * Execute jail punishment
 */
async function executeJail(guild, member, config, context) {
    try {
        const jailDurationSeconds = config.punishment.jailDuration;
        const reason = `AntiNuke: Excessive ${context.triggerAction} (${context.actionCount}/${context.limit})`;
        
        // Use existing jail functionality
        await jailMember(member, jailDurationSeconds, reason, guild.client.user);
        
        return { 
            success: true, 
            action: 'jail', 
            reason: `Jailed for ${Math.floor(jailDurationSeconds / 60)} minutes` 
        };
    } catch (error) {
        console.error('Failed to jail member:', error);
        return { success: false, action: 'jail', reason: error.message };
    }
}

/**
 * Log punishment execution to the configured channel
 */
async function logPunishmentExecution(guild, violator, config, actionType, context, punishmentResult) {
    try {
        if (!config.logging.logPunishments) return;
        
        const logChannelId = await getAntiNukeLogChannel(guild.id, guild);
        if (!logChannelId) return;
        
        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) return;
        
        const embed = await createEmbed(guild.id, {
            title: '🛡️ AntiNuke Punishment Executed',
            description: `**User:** ${violator} (${violator.tag})\n**Action:** ${context.triggerAction}\n**Count:** ${context.actionCount}/${context.limit}`,
            fields: [
                {
                    name: 'Punishment Details',
                    value: `**Type:** ${punishmentResult.action}\n**Status:** ${punishmentResult.success ? '✅ Success' : '❌ Failed'}\n**Reason:** ${punishmentResult.reason}`,
                    inline: false
                },
                {
                    name: 'Additional Context',
                    value: Object.entries(context)
                        .filter(([key]) => !['triggerAction', 'actionCount', 'limit'].includes(key))
                        .map(([key, value]) => `**${key}:** ${value}`)
                        .join('\n') || 'None',
                    inline: false
                }
            ],
            timestamp: new Date(),
            color: punishmentResult.success ? 0xff4444 : 0xff8800
        });
        
        await logChannel.send({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error logging punishment execution:', error);
    }
}

/**
 * Log punishment failure
 */
async function logPunishmentFailure(guild, violator, config, actionType, context, failureReason) {
    try {
        const logChannelId = await getAntiNukeLogChannel(guild.id, guild);
        if (!logChannelId) return;
        
        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) return;
        
        const embed = await createEmbed(guild.id, {
            title: '⚠️ AntiNuke Punishment Failed',
            description: `**User:** ${violator} (${violator.tag})\n**Action:** ${context.triggerAction}\n**Count:** ${context.actionCount}/${context.limit}`,
            fields: [
                {
                    name: 'Failure Reason',
                    value: failureReason,
                    inline: false
                }
            ],
            timestamp: new Date(),
            color: 0xff8800
        });
        
        await logChannel.send({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error logging punishment failure:', error);
    }
}

/**
 * Notify the punished user via DM
 */
async function notifyPunishedUser(member, guild, actionType, context, punishmentResult) {
    try {
        const embed = await createEmbed(guild.id, {
            title: '🛡️ AntiNuke Action Taken',
            description: `You have been punished in **${guild.name}** for excessive ${context.triggerAction.toLowerCase()}.`,
            fields: [
                {
                    name: 'Violation Details',
                    value: `**Action:** ${context.triggerAction}\n**Count:** ${context.actionCount}/${context.limit}\n**Punishment:** ${punishmentResult.action}`,
                    inline: false
                },
                {
                    name: 'Appeal Process',
                    value: 'If you believe this was a mistake, please contact the server administrators.',
                    inline: false
                }
            ],
            timestamp: new Date()
        });
        
        await member.send({ embeds: [embed] });
        
    } catch (error) {
        // Silently fail if we can't DM the user
        console.log(`[AntiNuke] Could not send DM notification to ${member.user.tag}`);
    }
}

module.exports = {
    executeAntiNukePunishment
};
