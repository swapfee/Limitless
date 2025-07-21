const { Events, AuditLogEvent } = require('discord.js');
const AntiNukeConfig = require('../models/AntiNukeConfig');
const AntiNukeCounter = require('../models/AntiNukeRateLimit');
const AntiNukeLog = require('../models/AntiNukeLog');
const { executeAntiNukePunishment } = require('../utils/antiNukeUtils');

module.exports = {
    name: Events.GuildUpdate,
    async execute(oldGuild, newGuild) {
        const guild = newGuild;
        
        try {
            // Get antinuke configuration
            const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
            
            // Check if antinuke is enabled and guild update monitoring is active
            if (!config.enabled || !config.getLimit('guildUpdate').enabled) {
                return;
            }
            
            // Check for significant changes that could be harmful
            const significantChanges = [];
            
            if (oldGuild.name !== newGuild.name) {
                significantChanges.push(`Name: "${oldGuild.name}" → "${newGuild.name}"`);
            }
            
            if (oldGuild.iconURL() !== newGuild.iconURL()) {
                significantChanges.push('Icon changed');
            }
            
            if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
                significantChanges.push(`Vanity URL: "${oldGuild.vanityURLCode}" → "${newGuild.vanityURLCode}"`);
            }
            
            if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
                significantChanges.push(`Verification Level: ${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`);
            }
            
            // Only proceed if there are significant changes
            if (significantChanges.length === 0) {
                return;
            }
            
            // Get audit log to find who updated the guild
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.GuildUpdate,
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
            await AntiNukeLog.logAction(guild.id, executor.id, 'guildUpdate', {
                changes: significantChanges,
                oldName: oldGuild.name,
                newName: newGuild.name,
                oldIcon: oldGuild.iconURL(),
                newIcon: newGuild.iconURL()
            });
            
            // Increment counter and check limit
            const counter = await AntiNukeCounter.incrementAction(guild.id, executor.id, 'guildUpdate');
            const limit = config.getLimit('guildUpdate');
            
            if (counter.count >= limit.max) {
                console.log(`[AntiNuke] Guild update limit exceeded by ${executor.tag} (${executor.id}) in ${guild.name}`);
                
                // Execute punishment
                await executeAntiNukePunishment(guild, executor, config, 'guildUpdate', {
                    triggerAction: 'Guild Update',
                    actionCount: counter.count,
                    limit: limit.max,
                    changes: significantChanges.join(', ')
                });
            } else if (config.logging.logActions) {
                console.log(`[AntiNuke] Guild update by ${executor.tag}: ${counter.count}/${limit.max}`);
            }
            
        } catch (error) {
            console.error('Error in guild update antinuke handler:', error);
        }
    },
};
