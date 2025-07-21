const { Events, AuditLogEvent } = require('discord.js');
const AntiNukeConfig = require('../models/AntiNukeConfig');
const AntiNukeCounter = require('../models/AntiNukeRateLimit');
const AntiNukeLog = require('../models/AntiNukeLog');
const { executeAntiNukePunishment } = require('../utils/antiNukeUtils');

module.exports = {
    name: Events.GuildRoleDelete,
    async execute(role) {
        const guild = role.guild;
        
        try {
            // Get antinuke configuration
            const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
            
            // Check if antinuke is enabled and role delete monitoring is active
            if (!config.enabled || !config.getLimit('roleDelete').enabled) {
                return;
            }
            
            // Get audit log to find who deleted the role
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.RoleDelete,
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
            await AntiNukeLog.logAction(guild.id, executor.id, 'roleDelete', {
                roleName: role.name,
                roleId: role.id,
                roleColor: role.color,
                rolePermissions: role.permissions.bitfield
            });
            
            // Increment counter and check limit
            const counter = await AntiNukeCounter.incrementAction(guild.id, executor.id, 'roleDelete');
            const limit = config.getLimit('roleDelete');
            
            if (counter.count >= limit.max) {
                console.log(`[AntiNuke] Role delete limit exceeded by ${executor.tag} (${executor.id}) in ${guild.name}`);
                
                // Execute punishment
                await executeAntiNukePunishment(guild, executor, config, 'roleDelete', {
                    triggerAction: 'Role Delete',
                    actionCount: counter.count,
                    limit: limit.max,
                    roleName: role.name
                });
            } else if (config.logging.logActions) {
                console.log(`[AntiNuke] Role delete by ${executor.tag}: ${counter.count}/${limit.max}`);
            }
            
        } catch (error) {
            console.error('Error in role delete antinuke handler:', error);
        }
    },
};
