const FakePermissions = require('../models/FakePermissions');
const StaffConfig = require('../models/StaffConfig');
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

module.exports = {
    hasPermission,
    hasRealPermission,
    isWhitelisted,
    canExecuteOn,
    getDiscordPermission,
    getPermissionSourceDescription
};
