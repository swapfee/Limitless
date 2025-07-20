const mongoose = require('mongoose');

const moderationCaseSchema = new mongoose.Schema({
    caseId: {
        type: Number,
        required: true
    },
    guildId: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['ban', 'tempban', 'unban', 'kick', 'softban', 'timeout', 'warn']
    },
    targetUserId: {
        type: String,
        required: true
    },
    targetUserTag: {
        type: String,
        required: true
    },
    executorId: {
        type: String,
        required: true
    },
    executorTag: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    duration: {
        type: String, // For tempban/timeout duration (e.g., "1h", "30m")
        default: null
    },
    expiresAt: {
        type: Date, // For tempban/timeout expiration
        default: null
    },
    additionalInfo: {
        deleteMessages: { type: Boolean, default: false },
        dmSent: { type: Boolean, default: false },
        automatic: { type: Boolean, default: false } // For automatic actions like tempban expiry
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for faster queries
moderationCaseSchema.index({ guildId: 1, caseId: 1 }, { unique: true });
moderationCaseSchema.index({ guildId: 1, targetUserId: 1 });
moderationCaseSchema.index({ guildId: 1, type: 1 });

/**
 * Get the next case ID for a guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<number>} - The next case ID
 */
moderationCaseSchema.statics.getNextCaseId = async function(guildId) {
    const lastCase = await this.findOne({ guildId })
        .sort({ caseId: -1 })
        .select('caseId');
    
    return lastCase ? lastCase.caseId + 1 : 1;
};

/**
 * Create a new moderation case
 * @param {Object} caseData - The case data
 * @returns {Promise<Object>} - The created case
 */
moderationCaseSchema.statics.createCase = async function(caseData) {
    const caseId = await this.getNextCaseId(caseData.guildId);
    
    const moderationCase = new this({
        ...caseData,
        caseId
    });
    
    return await moderationCase.save();
};

/**
 * Get cases for a specific user in a guild
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @param {number} limit - Maximum number of cases to return
 * @returns {Promise<Array>} - Array of moderation cases
 */
moderationCaseSchema.statics.getUserCases = async function(guildId, userId, limit = 10) {
    return await this.find({ guildId, targetUserId: userId })
        .sort({ createdAt: -1 })
        .limit(limit);
};

/**
 * Get a specific case by case ID
 * @param {string} guildId - The guild ID
 * @param {number} caseId - The case ID
 * @returns {Promise<Object|null>} - The moderation case or null
 */
moderationCaseSchema.statics.getCase = async function(guildId, caseId) {
    return await this.findOne({ guildId, caseId });
};

/**
 * Get recent cases for a guild
 * @param {string} guildId - The guild ID
 * @param {number} limit - Maximum number of cases to return
 * @returns {Promise<Array>} - Array of recent moderation cases
 */
moderationCaseSchema.statics.getRecentCases = async function(guildId, limit = 20) {
    return await this.find({ guildId })
        .sort({ createdAt: -1 })
        .limit(limit);
};

module.exports = mongoose.model('ModerationCase', moderationCaseSchema);
