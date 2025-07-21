const mongoose = require('mongoose');

const warningSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: String,
        required: true,
        index: true
    },
    moderatorId: {
        type: String,
        required: true
    },
    warnId: {
        type: Number,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    caseId: {
        type: Number,
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Compound indexes for efficient queries
warningSchema.index({ guildId: 1, userId: 1 });
warningSchema.index({ guildId: 1, warnId: 1 });

// Static method to get next warn ID for a guild
warningSchema.statics.getNextWarnId = async function(guildId) {
    const lastWarning = await this.findOne({ guildId }).sort({ warnId: -1 });
    return lastWarning ? lastWarning.warnId + 1 : 1;
};

// Static method to create a warning
warningSchema.statics.createWarning = async function(warningData) {
    const warnId = await this.getNextWarnId(warningData.guildId);
    const warning = new this({
        ...warningData,
        warnId
    });
    return await warning.save();
};

// Static method to get user warnings
warningSchema.statics.getUserWarnings = async function(guildId, userId) {
    return await this.find({ guildId, userId }).sort({ createdAt: -1 });
};

// Static method to count user warnings
warningSchema.statics.countUserWarnings = async function(guildId, userId) {
    return await this.countDocuments({ guildId, userId });
};

// Static method to get guild warnings (for leaderboard)
warningSchema.statics.getGuildWarningsLeaderboard = async function(guildId, limit = 10) {
    return await this.aggregate([
        { $match: { guildId } },
        { 
            $group: { 
                _id: '$userId', 
                count: { $sum: 1 },
                lastWarning: { $max: '$createdAt' }
            } 
        },
        { $sort: { count: -1, lastWarning: -1 } },
        { $limit: limit }
    ]);
};

// Static method to remove a warning by warnId
warningSchema.statics.removeWarning = async function(guildId, warnId) {
    return await this.findOneAndDelete({ guildId, warnId });
};

// Static method to clear all warnings for a user
warningSchema.statics.clearUserWarnings = async function(guildId, userId) {
    return await this.deleteMany({ guildId, userId });
};

// Static method to get warning by warnId
warningSchema.statics.getWarningById = async function(guildId, warnId) {
    return await this.findOne({ guildId, warnId });
};

module.exports = mongoose.model('Warning', warningSchema);
