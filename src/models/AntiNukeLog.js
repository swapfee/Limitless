const mongoose = require('mongoose');

const antiNukeLogSchema = new mongoose.Schema({
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
    actionType: {
        type: String,
        required: true,
        enum: [
            'channelDelete', 'channelCreate', 'roleDelete', 'roleCreate', 'roleUpdate',
            'memberKick', 'memberBan', 'webhookCreate', 'webhookDelete',
            'emojiDelete', 'guildUpdate', 'permissionGrant'
        ],
        index: true
    },
    targetType: {
        type: String,
        enum: ['channel', 'role', 'member', 'webhook', 'emoji', 'guild', 'permission'],
        required: true
    },
    targetId: String, // ID of the affected resource
    targetName: String, // Name of the affected resource
    executor: {
        id: { type: String, required: true },
        tag: String,
        username: String
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    violated: {
        type: Boolean,
        default: false
    },
    punishmentApplied: {
        type: String,
        enum: ['none', 'kick', 'ban', 'strip_permissions'],
        default: 'none'
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    versionKey: false
});

// Index for efficient queries
antiNukeLogSchema.index({ guildId: 1, userId: 1, timestamp: -1 });
antiNukeLogSchema.index({ guildId: 1, actionType: 1, timestamp: -1 });

// Static method to log an action
antiNukeLogSchema.statics.logAction = async function(data) {
    const logEntry = new this({
        guildId: data.guildId,
        userId: data.userId,
        actionType: data.actionType,
        targetType: data.targetType,
        targetId: data.targetId,
        targetName: data.targetName,
        executor: data.executor,
        details: data.details || {},
        violated: data.violated || false,
        punishmentApplied: data.punishmentApplied || 'none'
    });
    
    return await logEntry.save();
};

// Static method to get recent actions by user in time window
antiNukeLogSchema.statics.getRecentActions = async function(guildId, userId, actionType, windowSeconds) {
    const windowStart = new Date(Date.now() - (windowSeconds * 1000));
    
    return await this.find({
        guildId,
        userId,
        actionType,
        timestamp: { $gte: windowStart }
    }).sort({ timestamp: -1 });
};

// Static method to get violation count for user
antiNukeLogSchema.statics.getViolationCount = async function(guildId, userId, hoursBack = 24) {
    const windowStart = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
    
    return await this.countDocuments({
        guildId,
        userId,
        violated: true,
        timestamp: { $gte: windowStart }
    });
};

// Static method to get all violations in time range
antiNukeLogSchema.statics.getViolations = async function(guildId, hoursBack = 24, limit = 50) {
    const windowStart = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
    
    return await this.find({
        guildId,
        violated: true,
        timestamp: { $gte: windowStart }
    })
    .sort({ timestamp: -1 })
    .limit(limit);
};

// Static method to get action statistics
antiNukeLogSchema.statics.getActionStats = async function(guildId, hoursBack = 24) {
    const windowStart = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
    
    const stats = await this.aggregate([
        {
            $match: {
                guildId,
                timestamp: { $gte: windowStart }
            }
        },
        {
            $group: {
                _id: '$actionType',
                count: { $sum: 1 },
                violations: {
                    $sum: { $cond: ['$violated', 1, 0] }
                },
                uniqueUsers: { $addToSet: '$userId' }
            }
        },
        {
            $addFields: {
                uniqueUserCount: { $size: '$uniqueUsers' }
            }
        },
        {
            $project: {
                uniqueUsers: 0
            }
        }
    ]);
    
    return stats;
};

// Static method to clean old logs (older than X days)
antiNukeLogSchema.statics.cleanOldLogs = async function(daysToKeep = 30) {
    const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000));
    
    const result = await this.deleteMany({
        timestamp: { $lt: cutoffDate }
    });
    
    return result.deletedCount;
};

module.exports = mongoose.model('AntiNukeLog', antiNukeLogSchema);
