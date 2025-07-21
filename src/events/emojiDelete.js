const { Events, AuditLogEvent } = require('discord.js');
const AntiNukeConfig = require('../models/AntiNukeConfig');
const AntiNukeCounter = require('../models/AntiNukeRateLimit');
const AntiNukeLog = require('../models/AntiNukeLog');
const { executeAntiNukePunishment } = require('../utils/antiNukeUtils');

module.exports = {
    name: Events.GuildEmojiDelete,
    async execute(emoji) {
        const guild = emoji.guild;
        
        try {
            // Get antinuke configuration
            const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
            
            // Check if antinuke is enabled and emoji delete monitoring is active
            if (!config.enabled || !config.getLimit('emojiDelete').enabled) {
                return;
            }
            
            // Get audit log to find who deleted the emoji
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.EmojiDelete,
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
            await AntiNukeLog.logAction(guild.id, executor.id, 'emojiDelete', {
                emojiName: emoji.name,
                emojiId: emoji.id,
                emojiAnimated: emoji.animated,
                emojiUrl: emoji.url
            });
            
            // Increment counter and check limit
            const counter = await AntiNukeCounter.incrementAction(guild.id, executor.id, 'emojiDelete');
            const limit = config.getLimit('emojiDelete');
            
            if (counter.count >= limit.max) {
                console.log(`[AntiNuke] Emoji delete limit exceeded by ${executor.tag} (${executor.id}) in ${guild.name}`);
                
                // Execute punishment
                await executeAntiNukePunishment(guild, executor, config, 'emojiDelete', {
                    triggerAction: 'Emoji Delete',
                    actionCount: counter.count,
                    limit: limit.max,
                    emojiName: emoji.name
                });
            } else if (config.logging.logActions) {
                console.log(`[AntiNuke] Emoji delete by ${executor.tag}: ${counter.count}/${limit.max}`);
            }
            
        } catch (error) {
            console.error('Error in emoji delete antinuke handler:', error);
        }
    },
};
