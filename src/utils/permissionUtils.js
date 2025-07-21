const FakePermissions = require('../models/FakePermissions');
const StaffConfig = require('../models/StaffConfig');
const JailConfig = require('../models/JailConfig');
const AntiNukeConfig = require('../models/AntiNukeConfig');
const { PermissionFlagsBits } = require('discord.js');

/**
 * Permission checking utility for moderation commands
 * This handles both real Discord permissions and fake permissions
 */

/**
 * Check if a user has a specific permission (either real or fake)
 * @param {GuildMember} member - The guild member to check
 * @param {string} permission - The permission to check for
 * @param {boolean} allowFake - Whether to allow fake permissions (default: true)
 * @returns {Promise<{hasPermission: boolean, source: string}>}
 */
async function hasPermission(member, permission, allowFake = true) {
    // Check real Discord permissions first
    const discordPermission = getDiscordPermission(permission);
    if (discordPermission && member.permissions.has(discordPermission)) {
        return { hasPermission: true, source: 'discord' };
    }
    
    // Check fake permissions if allowed
    if (allowFake) {
        const userRoleIds = member.roles.cache.map(role => role.id);
        const hasFakePermission = await FakePermissions.hasPermission(
            member.guild.id, 
            userRoleIds, 
            permission
        );
        if (hasFakePermission) {
            return { hasPermission: true, source: 'fake' };
        }
    }
    
    return { hasPermission: false, source: 'none' };
}

/**
 * Check if a user should be considered as having "real" permissions only
 * This is used to determine if someone can bypass fake permission restrictions
 * @param {GuildMember} member - The guild member to check
 * @param {string} permission - The permission to check for
 * @returns {Promise<boolean>}
 */
async function hasRealPermission(member, permission) {
    const discordPermission = getDiscordPermission(permission);
    return discordPermission ? member.permissions.has(discordPermission) : false;
}

/**
 * Check if a user is whitelisted (has real permissions or is in staff roles)
 * This will be used later for whitelist functionality
 * @param {GuildMember} member - The guild member to check
 * @returns {Promise<boolean>}
 */
async function isWhitelisted(member) {
    // Check if user has administrator permission
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    
    // Check if user is in any staff roles
    const userRoleIds = member.roles.cache.map(role => role.id);
    const isStaff = await StaffConfig.isUserStaff(member.guild.id, userRoleIds);
    
    return isStaff;
}

/**
 * Convert our permission names to Discord permission flags
 * @param {string} permission - Our permission name
 * @returns {bigint|null} Discord permission flag or null if not found
 */
function getDiscordPermission(permission) {
    const permissionMap = {
        'ban_members': PermissionFlagsBits.BanMembers,
        'kick_members': PermissionFlagsBits.KickMembers,
        'timeout_members': PermissionFlagsBits.ModerateMembers,
        'manage_messages': PermissionFlagsBits.ManageMessages,
        'manage_roles': PermissionFlagsBits.ManageRoles,
        'manage_channels': PermissionFlagsBits.ManageChannels,
        'manage_nicknames': PermissionFlagsBits.ManageNicknames,
        'view_audit_log': PermissionFlagsBits.ViewAuditLog,
        'administrator': PermissionFlagsBits.Administrator
    };
    
    return permissionMap[permission] || null;
}

/**
 * Check if a user can perform an action on a target user
 * This includes hierarchy checks and self-action prevention
 * @param {GuildMember} executor - The member trying to perform the action
 * @param {GuildMember} target - The target member
 * @param {string} permission - The permission being checked
 * @returns {Promise<{canExecute: boolean, reason: string}>}
 */
async function canExecuteOn(executor, target, permission) {
    // Can't target yourself
    if (executor.id === target.id) {
        return { canExecute: false, reason: 'You cannot target yourself' };
    }
    
    // Check if executor has the permission
    const permissionCheck = await hasPermission(executor, permission);
    if (!permissionCheck.hasPermission) {
        return { canExecute: false, reason: 'You do not have permission to perform this action' };
    }
    
    // If executor only has fake permissions, check additional restrictions
    if (permissionCheck.source === 'fake') {
        // Check if target is whitelisted (has real permissions or staff roles)
        const targetWhitelisted = await isWhitelisted(target);
        if (targetWhitelisted) {
            return { canExecute: false, reason: 'Cannot target users with real permissions or staff roles using fake permissions' };
        }
        
        // Fake permissions users can't target other fake permission users with higher roles
        const executorHighestRole = executor.roles.highest;
        const targetHighestRole = target.roles.highest;
        
        if (targetHighestRole.position >= executorHighestRole.position) {
            return { canExecute: false, reason: 'You cannot target users with equal or higher roles' };
        }
    }
    
    // Standard hierarchy check for all users
    if (!executor.permissions.has(PermissionFlagsBits.Administrator)) {
        const executorHighestRole = executor.roles.highest;
        const targetHighestRole = target.roles.highest;
        
        if (targetHighestRole.position >= executorHighestRole.position) {
            return { canExecute: false, reason: 'You cannot target users with equal or higher roles' };
        }
    }
    
    return { canExecute: true, reason: 'Action allowed' };
}

/**
 * Get a user-friendly description of why they have a permission
 * @param {string} source - The permission source ('discord', 'fake', 'none')
 * @returns {string}
 */
function getPermissionSourceDescription(source) {
    switch (source) {
        case 'discord':
            return 'Discord Permission';
        case 'fake':
            return 'Fake Permission (Bot Only)';
        default:
            return 'No Permission';
    }
}

/**
 * Get the jail log channel ID for a guild
 * @param {string} guildId - The guild ID
 * @param {Guild} guild - The Discord guild object (optional, for fallback lookup)
 * @returns {Promise<string|null>} - The channel ID or null if not found
 */
async function getLogChannel(guildId, guild = null) {
    // First try to get from database
    const logChannelId = await JailConfig.getJailLogChannelId(guildId);
    if (logChannelId) {
        return logChannelId;
    }
    
    // Fallback to searching by name if database doesn't have it
    if (guild) {
        const logChannel = guild.channels.cache.find(channel => channel.name === 'jail-log');
        if (logChannel) {
            // Save to database for future use
            await JailConfig.setJailLogChannel(guildId, logChannel.id);
            return logChannel.id;
        }
    }
    
    return null;
}

/**
 * Get the antinuke log channel ID for a guild (same as jail-log channel)
 * @param {string} guildId - The guild ID
 * @param {Guild} guild - The Discord guild object (optional, for fallback lookup)
 * @returns {Promise<string|null>} - The channel ID or null if not found
 */
async function getAntiNukeLogChannel(guildId, guild = null) {
    // AntiNuke logs go to the same channel as jail logs
    return await getLogChannel(guildId, guild);
}

/**
 * Get the jail channel ID for a guild
 * @param {string} guildId - The guild ID
 * @param {Guild} guild - The Discord guild object (optional, for fallback lookup)
 * @returns {Promise<string|null>} - The channel ID or null if not found
 */
async function getJailChannel(guildId, guild = null) {
    // First try to get from database
    const jailChannelId = await JailConfig.getJailChannelId(guildId);
    if (jailChannelId) {
        return jailChannelId;
    }
    
    // Fallback to searching by name if database doesn't have it
    if (guild) {
        const jailChannel = guild.channels.cache.find(channel => channel.name === 'jail');
        if (jailChannel) {
            // Save to database for future use
            await JailConfig.setJailChannel(guildId, jailChannel.id);
            return jailChannel.id;
        }
    }
    
    return null;
}

/**
 * Get both jail-related channel IDs for a guild
 * @param {string} guildId - The guild ID  
 * @param {Guild} guild - The Discord guild object
 * @returns {Promise<{jailChannelId: string|null, logChannelId: string|null}>}
 */
async function getJailChannels(guildId, guild) {
    const jailChannelId = await getJailChannel(guildId, guild);
    const logChannelId = await getLogChannel(guildId, guild);
    
    return {
        jailChannelId,
        logChannelId
    };
}

/**
 * Get jail role ID for a guild
 * @param {string} guildId - The guild ID
 * @param {Guild} guild - The Discord guild object (optional, for fallback lookup)
 * @returns {Promise<string|null>} - The role ID or null if not found
 */
async function getJailRole(guildId, guild = null) {
    // First try to get from database
    const jailRoleId = await JailConfig.getJailRoleId(guildId);
    if (jailRoleId) {
        return jailRoleId;
    }
    
    // Fallback to searching by name if database doesn't have it
    if (guild) {
        const jailRole = guild.roles.cache.find(role => role.name === 'Jailed');
        if (jailRole) {
            // Save to database for future use
            await JailConfig.setJailRole(guildId, jailRole.id);
            return jailRole.id;
        }
    }
    
    return null;
}

/**
 * Check if a user can configure antinuke settings
 * Only server owner and designated antinuke admins can configure
 * @param {GuildMember} member - The guild member to check
 * @param {string} guildId - The guild ID
 * @returns {Promise<{canConfigure: boolean, reason: string, source: string}>}
 */
async function canConfigureAntiNuke(member, guildId) {
    // Check if user is the server owner
    if (member.guild.ownerId === member.user.id) {
        return { 
            canConfigure: true, 
            reason: 'Server owner', 
            source: 'owner' 
        };
    }
    
    // Get antinuke config
    const config = await AntiNukeConfig.getOrCreateConfig(guildId);
    
    // Check if user is an antinuke admin
    if (config.isAntiNukeAdmin(member.user.id)) {
        return { 
            canConfigure: true, 
            reason: 'AntiNuke admin', 
            source: 'admin' 
        };
    }
    
    return { 
        canConfigure: false, 
        reason: 'Only server owner and antinuke admins can configure antinuke settings', 
        source: 'none' 
    };
}

/**
 * Check if a user is whitelisted from antinuke actions
 * @param {GuildMember} member - The guild member to check
 * @param {string} guildId - The guild ID
 * @returns {Promise<{isWhitelisted: boolean, reason: string}>}
 */
async function isAntiNukeWhitelisted(member, guildId) {
    const config = await AntiNukeConfig.getOrCreateConfig(guildId);
    
    // Check if antinuke is disabled
    if (!config.enabled) {
        return { 
            isWhitelisted: true, 
            reason: 'AntiNuke is disabled' 
        };
    }
    
    // Check if user is whitelisted
    const isWhitelisted = config.isWhitelisted(
        member.user.id,
        member.roles.cache.map(r => r.id),
        member.guild.ownerId === member.user.id,
        member.user.bot
    );
    
    if (isWhitelisted) {
        return { 
            isWhitelisted: true, 
            reason: 'User is whitelisted' 
        };
    }
    
    return { 
        isWhitelisted: false, 
        reason: 'User is not whitelisted' 
    };
}

/**
 * Get dangerous permissions that should be monitored
 * @returns {string[]} Array of dangerous permission names
 */
function getDangerousPermissions() {
    return [
        'administrator',
        'manage_guild',
        'manage_roles', 
        'manage_channels',
        'manage_webhooks',
        'ban_members',
        'kick_members',
        'manage_messages',
        'manage_nicknames',
        'view_audit_log',
        'manage_emojis'
    ];
}

/**
 * Check if a permission change involves dangerous permissions
 * @param {object} oldPermissions - Old permission overwrites
 * @param {object} newPermissions - New permission overwrites
 * @returns {boolean} True if dangerous permissions were added
 */
function hasDangerousPermissionChange(oldPermissions, newPermissions) {
    const dangerousPerms = [
        PermissionFlagsBits.Administrator,
        PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageWebhooks,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ViewAuditLog
    ];
    
    // Check if any dangerous permissions were added
    for (const perm of dangerousPerms) {
        const hadPerm = oldPermissions && oldPermissions.has(perm);
        const hasPerm = newPermissions && newPermissions.has(perm);
        
        // If permission was added (didn't have it before, but has it now)
        if (!hadPerm && hasPerm) {
            return true;
        }
    }
    
    return false;
}

module.exports = {
    hasPermission,
    hasRealPermission,
    isWhitelisted,
    canExecuteOn,
    getDiscordPermission,
    getPermissionSourceDescription,
    getLogChannel,
    getAntiNukeLogChannel,
    getJailChannel,
    getJailChannels,
    getJailRole,
    canConfigureAntiNuke,
    isAntiNukeWhitelisted,
    getDangerousPermissions,
    hasDangerousPermissionChange
};
