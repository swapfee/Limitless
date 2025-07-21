const mongoose = require('mongoose');

const jailConfigSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    jailChannelId: {
        type: String,
        default: null,
        index: true
    },
    jailLogChannelId: {
        type: String,
        default: null,
        index: true
    },
    jailRoleId: {
        type: String,
        default: null,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field before saving
jailConfigSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

/**
 * Get or create jail configuration for a guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<Object>} - The jail configuration
 */
jailConfigSchema.statics.getOrCreateConfig = async function(guildId) {
    let config = await this.findOne({ guildId });
    
    if (!config) {
        config = new this({ guildId });
        await config.save();
    }
    
    return config;
};

/**
 * Set jail channel ID
 * @param {string} guildId - The guild ID
 * @param {string} channelId - The jail channel ID
 * @returns {Promise<Object>} - The updated configuration
 */
jailConfigSchema.statics.setJailChannel = async function(guildId, channelId) {
    const config = await this.getOrCreateConfig(guildId);
    config.jailChannelId = channelId;
    return await config.save();
};

/**
 * Set jail log channel ID
 * @param {string} guildId - The guild ID
 * @param {string} channelId - The jail log channel ID
 * @returns {Promise<Object>} - The updated configuration
 */
jailConfigSchema.statics.setJailLogChannel = async function(guildId, channelId) {
    const config = await this.getOrCreateConfig(guildId);
    config.jailLogChannelId = channelId;
    return await config.save();
};

/**
 * Set jail role ID
 * @param {string} guildId - The guild ID
 * @param {string} roleId - The jail role ID
 * @returns {Promise<Object>} - The updated configuration
 */
jailConfigSchema.statics.setJailRole = async function(guildId, roleId) {
    const config = await this.getOrCreateConfig(guildId);
    config.jailRoleId = roleId;
    return await config.save();
};

/**
 * Get jail channel ID for a guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<string|null>} - The jail channel ID or null
 */
jailConfigSchema.statics.getJailChannelId = async function(guildId) {
    const config = await this.findOne({ guildId });
    return config ? config.jailChannelId : null;
};

/**
 * Get jail log channel ID for a guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<string|null>} - The jail log channel ID or null
 */
jailConfigSchema.statics.getJailLogChannelId = async function(guildId) {
    const config = await this.findOne({ guildId });
    return config ? config.jailLogChannelId : null;
};

/**
 * Get jail role ID for a guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<string|null>} - The jail role ID or null
 */
jailConfigSchema.statics.getJailRoleId = async function(guildId) {
    const config = await this.findOne({ guildId });
    return config ? config.jailRoleId : null;
};

/**
 * Get complete jail configuration for a guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<Object>} - Complete jail configuration
 */
jailConfigSchema.statics.getJailConfig = async function(guildId) {
    const config = await this.findOne({ guildId });
    return {
        jailChannelId: config ? config.jailChannelId : null,
        jailLogChannelId: config ? config.jailLogChannelId : null,
        jailRoleId: config ? config.jailRoleId : null
    };
};

module.exports = mongoose.model('JailConfig', jailConfigSchema);
