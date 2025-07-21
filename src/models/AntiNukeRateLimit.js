const mongoose = require('mongoose');

const antiNukeCounterSchema = new mongoose.Schema({
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
            'emojiDelete', 'guildUpdate'
        ]
    },
    actionCount: {
        type: Number,
        default: 0
    },
    lastAction: {
        type: Date,
        default: Date.now
    },
    resetAt: {
        type: Date,
        default: null // Can be used for manual resets or daily/hourly resets
    }
}, {
    versionKey: false
});

// Compound index for efficient counter queries
antiNukeCounterSchema.index({ guildId: 1, userId: 1, actionType: 1 });

// Static method to increment action count
antiNukeCounterSchema.statics.incrementAction = async function(guildId, userId, actionType) {
    const counter = await this.findOneAndUpdate(
        { guildId, userId, actionType },
        { 
            $inc: { actionCount: 1 },
            $set: { lastAction: new Date() }
        },
        { 
            upsert: true, 
            new: true 
        }
    );
    
    return counter;
};

// Static method to get action count for user
antiNukeCounterSchema.statics.getActionCount = async function(guildId, userId, actionType) {
    const counter = await this.findOne({ guildId, userId, actionType });
    return counter ? counter.actionCount : 0;
};

// Static method to check if limit exceeded
antiNukeCounterSchema.statics.checkLimit = async function(guildId, userId, actionType, maxLimit) {
    const currentCount = await this.getActionCount(guildId, userId, actionType);
    
    return {
        violated: currentCount >= maxLimit,
        currentCount: currentCount,
        maxCount: maxLimit,
        remaining: Math.max(0, maxLimit - currentCount)
    };
};

// Static method to reset counter for user
antiNukeCounterSchema.statics.resetCounter = async function(guildId, userId, actionType = null) {
    const query = { guildId, userId };
    if (actionType) {
        query.actionType = actionType;
    }
    
    const result = await this.updateMany(query, { 
        $set: { 
            actionCount: 0, 
            resetAt: new Date() 
        }
    });
    return result.modifiedCount;
};

// Static method to get all counters for user
antiNukeCounterSchema.statics.getUserCounters = async function(guildId, userId) {
    return await this.find({ guildId, userId }).sort({ actionType: 1 });
};

// Static method to get guild statistics
antiNukeCounterSchema.statics.getGuildStats = async function(guildId) {
    const pipeline = [
        { $match: { guildId } },
        {
            $group: {
                _id: '$actionType',
                totalActions: { $sum: '$actionCount' },
                uniqueUsers: { $addToSet: '$userId' },
                avgActionsPerUser: { $avg: '$actionCount' }
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
    ];
    
    return await this.aggregate(pipeline);
};

// Static method to clean zero counters (optional cleanup)
antiNukeCounterSchema.statics.cleanZeroCounters = async function() {
    const result = await this.deleteMany({
        actionCount: 0
    });
    
    return result.deletedCount;
};

module.exports = mongoose.model('AntiNukeCounter', antiNukeCounterSchema);
