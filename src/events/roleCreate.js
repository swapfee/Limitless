const { Events, AuditLogEvent } = require('discord.js');
const AntiNukeConfig = require('../models/AntiNukeConfig');
const AntiNukeCounter = require('../models/AntiNukeRateLimit');
const AntiNukeLog = require('../models/AntiNukeLog');
const { executeAntiNukePunishment } = require('../utils/antiNukeUtils');

module.exports = {
    name: Events.GuildRoleCreate,
    async execute(role) {
        const guild = role.guild;
        
        try {
            // Get antinuke configuration
            const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
            
            // Check if antinuke is enabled and role create monitoring is active
            if (!config.enabled || !config.getLimit('roleCreate').enabled) {
                return;
            }
            
            // Get audit log to find who created the role
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.RoleCreate,
                limit: 1
            });
            
            const auditEntry = auditLogs.entries.first();
            if (!auditEntry || !auditEntry.executor) return;
            
            const executor = auditEntry.executor;
            
            // Check if user is whitelisted
            if (config.isWhitelisted(executor.id, guild.ownerId)) {
                return;
            }
            
            // Check if the role has dangerous permissions
            const dangerousPermissions = [
                'Administrator',
                'ManageGuild',
                'ManageRoles',
                'ManageChannels',
                'BanMembers',
                'KickMembers',
                'ManageMessages',
                'ManageWebhooks'
            ];
            
            const roleDangerousPerms = role.permissions.toArray().filter(perm => 
                dangerousPermissions.includes(perm)
            );
            
            // Log the action
            await AntiNukeLog.logAction(guild.id, executor.id, 'roleCreate', {
                roleName: role.name,
                roleId: role.id,
                roleColor: role.color,
                rolePermissions: role.permissions.bitfield,
                dangerousPermissions: roleDangerousPerms,
                hasDangerousPerms: roleDangerousPerms.length > 0
            });
            
            // Increment counter and check limit
            const counter = await AntiNukeCounter.incrementAction(guild.id, executor.id, 'roleCreate');
            const limit = config.getLimit('roleCreate');
            
            if (counter.count >= limit.max) {
                console.log(`[AntiNuke] Role create limit exceeded by ${executor.tag} (${executor.id}) in ${guild.name}`);
                
                // Execute punishment
                await executeAntiNukePunishment(guild, executor, config, 'roleCreate', {
                    triggerAction: 'Role Create',
                    actionCount: counter.count,
                    limit: limit.max,
                    roleName: role.name,
                    dangerousPermissions: roleDangerousPerms.join(', ') || 'None'
                });
            } else if (config.logging.logActions) {
                console.log(`[AntiNuke] Role create by ${executor.tag}: ${counter.count}/${limit.max}`);
            }
            
        } catch (error) {
            console.error('Error in role create antinuke handler:', error);
        }
    },
};
