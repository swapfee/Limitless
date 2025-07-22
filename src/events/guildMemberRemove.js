const { Events, AuditLogEvent } = require('discord.js');
const AntiNukeConfig = require('../models/AntiNukeConfig');
const AntiNukeCounter = require('../models/AntiNukeRateLimit');
const AntiNukeLog = require('../models/AntiNukeLog');
const { executeAntiNukePunishment } = require('../utils/antiNukeUtils');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        const guild = member.guild;
        
        try {
            // Get antinuke configuration
            const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
            
            // Check if antinuke is enabled and member kick monitoring is active
            if (!config.enabled || !config.getLimit('memberKick').enabled) {
                return;
            }
            
            // Get audit log to find who kicked the member (if it was a kick)
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.MemberKick,
                limit: 1
            });
            
            const auditEntry = auditLogs.entries.first();
            
            // Check if this was actually a kick (audit entry exists and is recent)
            if (!auditEntry || !auditEntry.executor || 
                Date.now() - auditEntry.createdTimestamp > 5000) { // 5 second window
                return; // This was likely a voluntary leave, not a kick
            }
            
            const executor = auditEntry.executor;
            
            // Check if user is whitelisted
            if (config.isWhitelisted(executor.id, guild.ownerId)) {
                return;
            }
            
            // Log the action
            await AntiNukeLog.logAction({
                guildId: guild.id,
                userId: executor.id,
                actionType: 'memberKick',
                targetType: 'member',
                targetId: member.user.id,
                targetName: member.user.tag,
                executor: {
                    id: executor.id,
                    tag: executor.tag,
                    username: executor.username
                },
                details: {
                    kickedUserId: member.user.id,
                    kickedUserTag: member.user.tag,
                    reason: auditEntry.reason
                }
            });
            
            // Increment counter and check limit
            const counter = await AntiNukeCounter.incrementAction(guild.id, executor.id, 'memberKick');
            const limit = config.getLimit('memberKick');
            
            if (counter.count >= limit.max) {
                console.log(`[AntiNuke] Member kick limit exceeded by ${executor.tag} (${executor.id}) in ${guild.name}`);
                
                // Execute punishment
                await executeAntiNukePunishment(guild, executor, config, 'memberKick', {
                    triggerAction: 'Member Kick',
                    actionCount: counter.count,
                    limit: limit.max,
                    kickedUser: member.user.tag
                });
            } else if (config.logging.logActions) {
                console.log(`[AntiNuke] Member kick by ${executor.tag}: ${counter.count}/${limit.max}`);
            }
            
        } catch (error) {
            console.error('Error in member kick antinuke handler:', error);
        }
    },
};
