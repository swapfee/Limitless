const { Events, AuditLogEvent } = require('discord.js');
const AntiNukeConfig = require('../models/AntiNukeConfig');
const AntiNukeCounter = require('../models/AntiNukeRateLimit');
const AntiNukeLog = require('../models/AntiNukeLog');
const { executeAntiNukePunishment } = require('../utils/antiNukeUtils');

module.exports = {
    name: Events.GuildRoleUpdate,
    async execute(oldRole, newRole) {
        const guild = newRole.guild;
        
        try {
            // Get antinuke configuration
            const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
            
            // Check if antinuke is enabled and role update monitoring is active
            if (!config.enabled || !config.getLimit('roleUpdate').enabled) {
                return;
            }
            
            // Check if this is a dangerous permission change
            const oldPermissions = oldRole.permissions.bitfield;
            const newPermissions = newRole.permissions.bitfield;
            
            // Define dangerous permissions
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
            
            // Check if dangerous permissions were added
            const addedPermissions = newRole.permissions.toArray().filter(perm => 
                !oldRole.permissions.has(perm) && dangerousPermissions.includes(perm)
            );
            
            // Only trigger if dangerous permissions were added
            if (addedPermissions.length === 0) {
                return;
            }
            
            // Get audit log to find who updated the role
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.RoleUpdate,
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
            await AntiNukeLog.logAction(guild.id, executor.id, 'roleUpdate', {
                roleName: newRole.name,
                roleId: newRole.id,
                addedPermissions: addedPermissions,
                oldPermissions: oldPermissions.toString(),
                newPermissions: newPermissions.toString()
            });
            
            // Increment counter and check limit
            const counter = await AntiNukeCounter.incrementAction(guild.id, executor.id, 'roleUpdate');
            const limit = config.getLimit('roleUpdate');
            
            if (counter.count >= limit.max) {
                console.log(`[AntiNuke] Role update limit exceeded by ${executor.tag} (${executor.id}) in ${guild.name}`);
                
                // Execute punishment
                await executeAntiNukePunishment(guild, executor, config, 'roleUpdate', {
                    triggerAction: 'Role Update (Dangerous Permissions)',
                    actionCount: counter.count,
                    limit: limit.max,
                    roleName: newRole.name,
                    addedPermissions: addedPermissions.join(', ')
                });
            } else if (config.logging.logActions) {
                console.log(`[AntiNuke] Dangerous role update by ${executor.tag}: ${counter.count}/${limit.max}`);
            }
            
        } catch (error) {
            console.error('Error in role update antinuke handler:', error);
        }
    },
};
