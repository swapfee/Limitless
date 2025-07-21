const { Events, ChannelType, AuditLogEvent } = require('discord.js');
const AntiNukeConfig = require('../models/AntiNukeConfig');
const AntiNukeCounter = require('../models/AntiNukeRateLimit');
const AntiNukeLog = require('../models/AntiNukeLog');
const { executeAntiNukePunishment } = require('../utils/antiNukeUtils');

module.exports = {
    name: Events.ChannelCreate,
    async execute(channel) {
        // Only handle text and voice channels in guilds
        if (!channel.guild || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildVoice)) {
            return;
        }
        
        const guild = channel.guild;
        
        try {
            // AntiNuke monitoring for channel creation
            await handleAntiNukeChannelCreate(guild, channel);
            
            // Existing moderation role setup
            // Get the moderation roles
            const mutedRole = guild.roles.cache.find(role => role.name === 'mute');
            const imageMutedRole = guild.roles.cache.find(role => role.name === 'imute');
            const reactionMutedRole = guild.roles.cache.find(role => role.name === 'rmute');
            const jailedRole = guild.roles.cache.find(role => role.name === 'Jailed');
            
            // Configure permissions for each mute role
            const permissionPromises = [];
            
            // Muted role permissions
            if (mutedRole) {
                permissionPromises.push(
                    channel.permissionOverwrites.create(mutedRole, {
                        SendMessages: false,
                        Speak: false
                    }).catch(error => {
                        console.error(`Failed to set mute permissions for #${channel.name}:`, error);
                    })
                );
            }
            
            // Image Muted role permissions
            if (imageMutedRole) {
                permissionPromises.push(
                    channel.permissionOverwrites.create(imageMutedRole, {
                        AttachFiles: false,
                        EmbedLinks: false
                    }).catch(error => {
                        console.error(`Failed to set imute permissions for #${channel.name}:`, error);
                    })
                );
            }
            
            // Reaction Muted role permissions
            if (reactionMutedRole) {
                permissionPromises.push(
                    channel.permissionOverwrites.create(reactionMutedRole, {
                        AddReactions: false
                    }).catch(error => {
                        console.error(`Failed to set rmute permissions for #${channel.name}:`, error);
                    })
                );
            }
            
            // Jailed role permissions (deny access to all channels except jail)
            if (jailedRole && channel.name !== 'jail') {
                permissionPromises.push(
                    channel.permissionOverwrites.create(jailedRole, {
                        ViewChannel: false
                    }).catch(error => {
                        console.error(`Failed to set jailed permissions for #${channel.name}:`, error);
                    })
                );
            }
            
            // Special handling for jail channel
            if (jailedRole && channel.name === 'jail') {
                permissionPromises.push(
                    channel.permissionOverwrites.create(jailedRole, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    }).catch(error => {
                        console.error(`Failed to set jail permissions for #${channel.name}:`, error);
                    })
                );
                
                // Deny everyone else access to jail channel
                permissionPromises.push(
                    channel.permissionOverwrites.create(guild.roles.everyone, {
                        ViewChannel: false
                    }).catch(error => {
                        console.error(`Failed to set everyone permissions for #${channel.name}:`, error);
                    })
                );
            }
            
            // Execute all permission changes
            await Promise.all(permissionPromises);
            
            console.log(`✅ Auto-configured moderation permissions for new channel: #${channel.name}`);
            
        } catch (error) {
            console.error(`❌ Failed to auto-configure permissions for channel #${channel.name}:`, error);
        }
    },
};

/**
 * Handle antinuke monitoring for channel creation
 */
async function handleAntiNukeChannelCreate(guild, channel) {
    try {
        // Get antinuke configuration
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        
        // Check if antinuke is enabled and channel create monitoring is active
        if (!config.enabled || !config.getLimit('channelCreate').enabled) {
            return;
        }
        
        // Get audit log to find who created the channel
        const auditLogs = await guild.fetchAuditLogs({
            type: AuditLogEvent.ChannelCreate,
            limit: 1
        });
        
        const auditEntry = auditLogs.entries.first();
        if (!auditEntry || !auditEntry.executor) return;
        
        const executor = auditEntry.executor;
        
        // Check if user is whitelisted
        if (config.isWhitelisted(executor.id, guild.ownerId)) {
            return;
        }
        
        // Log the action
        await AntiNukeLog.logAction(guild.id, executor.id, 'channelCreate', {
            channelName: channel.name,
            channelId: channel.id,
            channelType: channel.type
        });
        
        // Increment counter and check limit
        const counter = await AntiNukeCounter.incrementAction(guild.id, executor.id, 'channelCreate');
        const limit = config.getLimit('channelCreate');
        
        if (counter.count >= limit.max) {
            console.log(`[AntiNuke] Channel create limit exceeded by ${executor.tag} (${executor.id}) in ${guild.name}`);
            
            // Execute punishment
            await executeAntiNukePunishment(guild, executor, config, 'channelCreate', {
                triggerAction: 'Channel Create',
                actionCount: counter.count,
                limit: limit.max,
                channelName: channel.name
            });
        } else if (config.logging.logActions) {
            console.log(`[AntiNuke] Channel create by ${executor.tag}: ${counter.count}/${limit.max}`);
        }
        
    } catch (error) {
        console.error('Error in channel create antinuke handler:', error);
    }
}
