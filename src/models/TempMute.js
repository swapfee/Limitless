const mongoose = require('mongoose');

const tempMuteSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
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
    muteDuration: {
        type: String,
        required: true
    },
    unmuteTime: {
        type: Date,
        required: true,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index for efficient queries
tempMuteSchema.index({ guildId: 1, userId: 1 });

// Static method to create a temp mute
tempMuteSchema.statics.createTempMute = async function(tempMuteData) {
    const tempMute = new this(tempMuteData);
    return await tempMute.save();
};

// Static method to find temp mute by guild and user
tempMuteSchema.statics.findByGuildAndUser = async function(guildId, userId) {
    return await this.findOne({ guildId, userId });
};

// Static method to find expired temp mutes
tempMuteSchema.statics.findExpired = async function() {
    return await this.find({
        unmuteTime: { $lte: new Date() }
    });
};

// Static method to remove temp mute
tempMuteSchema.statics.removeTempMute = async function(guildId, userId) {
    return await this.deleteOne({ guildId, userId });
};

// Static method to get all temp mutes for a guild
tempMuteSchema.statics.getGuildTempMutes = async function(guildId) {
    return await this.find({ guildId }).sort({ unmuteTime: 1 });
};

module.exports = mongoose.model('TempMute', tempMuteSchema);
