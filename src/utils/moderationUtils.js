const ModerationCase = require('../models/ModerationCase');

/**
 * Create a moderation case and return the case ID
 * @param {Object} caseData - The case data
 * @param {string} caseData.guildId - Guild ID
 * @param {string} caseData.type - Type of moderation action
 * @param {Object} caseData.target - Target user object {id, tag}
 * @param {Object} caseData.executor - Executor user object {id, tag}
 * @param {string} caseData.reason - Reason for the action
 * @param {string} [caseData.duration] - Duration for temp actions
 * @param {Date} [caseData.expiresAt] - Expiration date for temp actions
 * @param {Object} [caseData.additionalInfo] - Additional information
 * @returns {Promise<number>} - The case ID
 */
async function createModerationCase(caseData) {
    try {
        const moderationCase = await ModerationCase.createCase({
            guildId: caseData.guildId,
            type: caseData.type,
            targetUserId: caseData.target.id,
            targetUserTag: caseData.target.tag,
            executorId: caseData.executor.id,
            executorTag: caseData.executor.tag,
            reason: caseData.reason,
            duration: caseData.duration || null,
            expiresAt: caseData.expiresAt || null,
            additionalInfo: caseData.additionalInfo || {}
        });

        return moderationCase.caseId;
    } catch (error) {
        console.error('Error creating moderation case:', error);
        throw error;
    }
}

/**
 * Get user's moderation history
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} [limit] - Maximum number of cases to return
 * @returns {Promise<Array>} - Array of moderation cases
 */
async function getUserModerationHistory(guildId, userId, limit = 10) {
    try {
        return await ModerationCase.getUserCases(guildId, userId, limit);
    } catch (error) {
        console.error('Error getting user moderation history:', error);
        throw error;
    }
}

/**
 * Get a specific moderation case
 * @param {string} guildId - Guild ID
 * @param {number} caseId - Case ID
 * @returns {Promise<Object|null>} - The moderation case or null
 */
async function getModerationCase(guildId, caseId) {
    try {
        return await ModerationCase.getCase(guildId, caseId);
    } catch (error) {
        console.error('Error getting moderation case:', error);
        throw error;
    }
}

/**
 * Get recent moderation cases for a guild
 * @param {string} guildId - Guild ID
 * @param {number} [limit] - Maximum number of cases to return
 * @returns {Promise<Array>} - Array of recent moderation cases
 */
async function getRecentModerationCases(guildId, limit = 20) {
    try {
        return await ModerationCase.getRecentCases(guildId, limit);
    } catch (error) {
        console.error('Error getting recent moderation cases:', error);
        throw error;
    }
}

/**
 * Format moderation type for display
 * @param {string} type - The moderation type
 * @returns {string} - Formatted type
 */
function formatModerationType(type) {
    const typeMap = {
        'ban': 'Ban',
        'tempban': 'Temporary Ban',
        'unban': 'Unban',
        'kick': 'Kick',
        'softban': 'Softban',
        'mute': 'Mute',
        'unmute': 'Unmute',
        'timeout': 'Timeout',
        'warn': 'Warning'
    };
    
    return typeMap[type] || type;
}

module.exports = {
    createModerationCase,
    getUserModerationHistory,
    getModerationCase,
    getRecentModerationCases,
    formatModerationType
};
