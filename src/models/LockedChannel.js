const mongoose = require('mongoose');

const lockedChannelSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },
    channelId: {
        type: String,
        required: true,
        index: true
    },
    executorId: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true,
        default: 'No reason provided'
    },
    lockType: {
        type: String,
        required: true,
        enum: ['individual', 'mass'],
        default: 'individual'
    },
    originalPermissions: [{
        roleId: String,
        allowed: String, // Bitfield as string
        denied: String   // Bitfield as string
    }],
    lockedAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Compound index for efficient lookups
lockedChannelSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

// Static method to lock a channel
lockedChannelSchema.statics.lockChannel = async function(lockData) {
    // Remove existing lock if it exists
    await this.findOneAndDelete({ 
        guildId: lockData.guildId, 
        channelId: lockData.channelId 
    });
    
    const lockedChannel = new this(lockData);
    return await lockedChannel.save();
};

// Static method to unlock a channel
lockedChannelSchema.statics.unlockChannel = async function(guildId, channelId) {
    return await this.findOneAndDelete({ guildId, channelId });
};

// Static method to check if channel is locked
lockedChannelSchema.statics.isChannelLocked = async function(guildId, channelId) {
    const locked = await this.findOne({ guildId, channelId });
    return !!locked;
};

// Static method to get locked channel data
lockedChannelSchema.statics.getLockedChannel = async function(guildId, channelId) {
    return await this.findOne({ guildId, channelId });
};

// Static method to get all locked channels in a guild
lockedChannelSchema.statics.getGuildLockedChannels = async function(guildId) {
    return await this.find({ guildId }).sort({ lockedAt: -1 });
};

// Static method to get mass locked channels in a guild
lockedChannelSchema.statics.getMassLockedChannels = async function(guildId) {
    return await this.find({ guildId, lockType: 'mass' }).sort({ lockedAt: -1 });
};

// Static method to unlock all channels in a guild
lockedChannelSchema.statics.unlockAllChannels = async function(guildId) {
    const lockedChannels = await this.find({ guildId });
    await this.deleteMany({ guildId });
    return lockedChannels;
};

module.exports = mongoose.model('LockedChannel', lockedChannelSchema);
