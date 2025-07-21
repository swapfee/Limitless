const mongoose = require('mongoose');

const lockdownConfigSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    lockdownRoles: [{
        type: String, // Role IDs that can lock channels without manage_channels permission
        required: true
    }],
    ignoredChannels: [{
        type: String, // Channel IDs that are ignored during "unlock all"
        required: true
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field on save
lockdownConfigSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Static method to get or create lockdown config for a guild
lockdownConfigSchema.statics.getOrCreateConfig = async function(guildId) {
    let config = await this.findOne({ guildId });
    if (!config) {
        config = new this({
            guildId,
            lockdownRoles: [],
            ignoredChannels: []
        });
        await config.save();
    }
    return config;
};

// Static method to add lockdown role
lockdownConfigSchema.statics.addLockdownRole = async function(guildId, roleId) {
    const config = await this.getOrCreateConfig(guildId);
    if (!config.lockdownRoles.includes(roleId)) {
        config.lockdownRoles.push(roleId);
        await config.save();
    }
    return config;
};

// Static method to remove lockdown role
lockdownConfigSchema.statics.removeLockdownRole = async function(guildId, roleId) {
    const config = await this.getOrCreateConfig(guildId);
    config.lockdownRoles = config.lockdownRoles.filter(id => id !== roleId);
    await config.save();
    return config;
};

// Static method to add ignored channel
lockdownConfigSchema.statics.addIgnoredChannel = async function(guildId, channelId) {
    const config = await this.getOrCreateConfig(guildId);
    if (!config.ignoredChannels.includes(channelId)) {
        config.ignoredChannels.push(channelId);
        await config.save();
    }
    return config;
};

// Static method to remove ignored channel
lockdownConfigSchema.statics.removeIgnoredChannel = async function(guildId, channelId) {
    const config = await this.getOrCreateConfig(guildId);
    config.ignoredChannels = config.ignoredChannels.filter(id => id !== channelId);
    await config.save();
    return config;
};

// Static method to check if role can lockdown
lockdownConfigSchema.statics.canRoleLockdown = async function(guildId, roleIds) {
    const config = await this.getOrCreateConfig(guildId);
    return roleIds.some(roleId => config.lockdownRoles.includes(roleId));
};

// Static method to check if channel is ignored
lockdownConfigSchema.statics.isChannelIgnored = async function(guildId, channelId) {
    const config = await this.getOrCreateConfig(guildId);
    return config.ignoredChannels.includes(channelId);
};

module.exports = mongoose.model('LockdownConfig', lockdownConfigSchema);
