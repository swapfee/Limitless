const { Events, AuditLogEvent } = require('discord.js');
const AntiNukeConfig = require('../models/AntiNukeConfig');
const AntiNukeCounter = require('../models/AntiNukeRateLimit');
const AntiNukeLog = require('../models/AntiNukeLog');
const { executeAntiNukePunishment } = require('../utils/antiNukeUtils');

module.exports = {
    name: Events.ChannelDelete,
    async execute(channel) {
        // Only handle guild channels
        if (!channel.guild) return;
        
        const guild = channel.guild;
        
        try {
            // Get antinuke configuration
            const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
            
            // Check if antinuke is enabled and channel delete monitoring is active
            if (!config.enabled || !config.getLimit('channelDelete').enabled) {
                return;
            }
            
            // Get audit log to find who deleted the channel
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelDelete,
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
            await AntiNukeLog.logAction(guild.id, executor.id, 'channelDelete', {
                channelName: channel.name,
                channelId: channel.id,
                channelType: channel.type
            });
            
            // Increment counter and check limit
            const counter = await AntiNukeCounter.incrementAction(guild.id, executor.id, 'channelDelete');
            const limit = config.getLimit('channelDelete');
            
            if (counter.count >= limit.max) {
                console.log(`[AntiNuke] Channel delete limit exceeded by ${executor.tag} (${executor.id}) in ${guild.name}`);
                
                // Execute punishment
                await executeAntiNukePunishment(guild, executor, config, 'channelDelete', {
                    triggerAction: 'Channel Delete',
                    actionCount: counter.count,
                    limit: limit.max,
                    channelName: channel.name
                });
            } else if (config.logging.logActions) {
                console.log(`[AntiNuke] Channel delete by ${executor.tag}: ${counter.count}/${limit.max}`);
            }
            
        } catch (error) {
            console.error('Error in channel delete antinuke handler:', error);
        }
    },
};
