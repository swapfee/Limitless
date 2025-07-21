const { Events, AuditLogEvent } = require('discord.js');
const AntiNukeConfig = require('../models/AntiNukeConfig');
const AntiNukeCounter = require('../models/AntiNukeRateLimit');
const AntiNukeLog = require('../models/AntiNukeLog');
const { executeAntiNukePunishment } = require('../utils/antiNukeUtils');

module.exports = {
    name: Events.WebhooksUpdate,
    async execute(channel) {
        const guild = channel.guild;
        
        try {
            // Get antinuke configuration
            const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
            
            // Check if antinuke is enabled
            if (!config.enabled) return;
            
            // Get audit logs for webhook create and delete
            const [createLogs, deleteLogs] = await Promise.all([
                guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 3 }),
                guild.fetchAuditLogs({ type: AuditLogEvent.WebhookDelete, limit: 3 })
            ]);
            
            // Process webhook creations
            for (const entry of createLogs.entries.values()) {
                if (Date.now() - entry.createdTimestamp > 10000) break; // Only recent entries
                
                const executor = entry.executor;
                if (!executor || config.isWhitelisted(executor.id, guild.ownerId)) continue;
                
                // Check if webhook create monitoring is active
                if (!config.getLimit('webhookCreate').enabled) continue;
                
                // Log the action
                await AntiNukeLog.logAction(guild.id, executor.id, 'webhookCreate', {
                    channelId: channel.id,
                    channelName: channel.name,
                    webhookId: entry.target?.id,
                    webhookName: entry.target?.name
                });
                
                // Increment counter and check limit
                const counter = await AntiNukeCounter.incrementAction(guild.id, executor.id, 'webhookCreate');
                const limit = config.getLimit('webhookCreate');
                
                if (counter.count >= limit.max) {
                    console.log(`[AntiNuke] Webhook create limit exceeded by ${executor.tag} (${executor.id}) in ${guild.name}`);
                    
                    await executeAntiNukePunishment(guild, executor, config, 'webhookCreate', {
                        triggerAction: 'Webhook Create',
                        actionCount: counter.count,
                        limit: limit.max,
                        channelName: channel.name
                    });
                }
            }
            
            // Process webhook deletions
            for (const entry of deleteLogs.entries.values()) {
                if (Date.now() - entry.createdTimestamp > 10000) break; // Only recent entries
                
                const executor = entry.executor;
                if (!executor || config.isWhitelisted(executor.id, guild.ownerId)) continue;
                
                // Check if webhook delete monitoring is active
                if (!config.getLimit('webhookDelete').enabled) continue;
                
                // Log the action
                await AntiNukeLog.logAction(guild.id, executor.id, 'webhookDelete', {
                    channelId: channel.id,
                    channelName: channel.name,
                    webhookId: entry.target?.id,
                    webhookName: entry.target?.name
                });
                
                // Increment counter and check limit
                const counter = await AntiNukeCounter.incrementAction(guild.id, executor.id, 'webhookDelete');
                const limit = config.getLimit('webhookDelete');
                
                if (counter.count >= limit.max) {
                    console.log(`[AntiNuke] Webhook delete limit exceeded by ${executor.tag} (${executor.id}) in ${guild.name}`);
                    
                    await executeAntiNukePunishment(guild, executor, config, 'webhookDelete', {
                        triggerAction: 'Webhook Delete',
                        actionCount: counter.count,
                        limit: limit.max,
                        channelName: channel.name
                    });
                }
            }
            
        } catch (error) {
            console.error('Error in webhook antinuke handler:', error);
        }
    },
};
