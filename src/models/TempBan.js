const mongoose = require('mongoose');

const tempBanSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    executorId: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    banDuration: {
        type: String,
        required: true
    },
    unbanTime: {
        type: Date,
        required: true
    },
    deleteMessages: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create index for efficient queries
tempBanSchema.index({ guildId: 1, unbanTime: 1 });

/**
 * Get all active temporary bans for a guild
 * @param {string} guildId - The guild ID
 * @returns {Array} - Array of active temp bans
 */
tempBanSchema.statics.getActiveTempBans = async function(guildId) {
    return await this.find({
        guildId: guildId,
        unbanTime: { $gt: new Date() }
    }).sort({ unbanTime: 1 });
};

/**
 * Get all expired temporary bans
 * @returns {Array} - Array of expired temp bans
 */
tempBanSchema.statics.getExpiredTempBans = async function() {
    return await this.find({
        unbanTime: { $lte: new Date() }
    });
};

/**
 * Remove a temporary ban record
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 */
tempBanSchema.statics.removeTempBan = async function(guildId, userId) {
    await this.deleteOne({ guildId: guildId, userId: userId });
};

/**
 * Create a new temporary ban record
 * @param {Object} banData - The ban data
 * @returns {Document} - The created temp ban document
 */
tempBanSchema.statics.createTempBan = async function(banData) {
    return await this.create(banData);
};

module.exports = mongoose.model('TempBan', tempBanSchema);
