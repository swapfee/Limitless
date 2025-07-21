const { Events, AuditLogEvent } = require('discord.js');
const AntiNukeConfig = require('../models/AntiNukeConfig');
const AntiNukeCounter = require('../models/AntiNukeRateLimit');
const AntiNukeLog = require('../models/AntiNukeLog');
const { executeAntiNukePunishment } = require('../utils/antiNukeUtils');

module.exports = {
    name: Events.GuildBanAdd,
    async execute(ban) {
        const guild = ban.guild;
        
        try {
            // Get antinuke configuration
            const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
            
            // Check if antinuke is enabled and member ban monitoring is active
            if (!config.enabled || !config.getLimit('memberBan').enabled) {
                return;
            }
            
            // Get audit log to find who banned the member
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.MemberBanAdd,
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
            await AntiNukeLog.logAction(guild.id, executor.id, 'memberBan', {
                bannedUserId: ban.user.id,
                bannedUserTag: ban.user.tag,
                reason: ban.reason
            });
            
            // Increment counter and check limit
            const counter = await AntiNukeCounter.incrementAction(guild.id, executor.id, 'memberBan');
            const limit = config.getLimit('memberBan');
            
            if (counter.count >= limit.max) {
                console.log(`[AntiNuke] Member ban limit exceeded by ${executor.tag} (${executor.id}) in ${guild.name}`);
                
                // Execute punishment
                await executeAntiNukePunishment(guild, executor, config, 'memberBan', {
                    triggerAction: 'Member Ban',
                    actionCount: counter.count,
                    limit: limit.max,
                    bannedUser: ban.user.tag
                });
            } else if (config.logging.logActions) {
                console.log(`[AntiNuke] Member ban by ${executor.tag}: ${counter.count}/${limit.max}`);
            }
            
        } catch (error) {
            console.error('Error in member ban antinuke handler:', error);
        }
    },
};
