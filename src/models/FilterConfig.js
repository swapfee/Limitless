const mongoose = require('mongoose');

const filterConfigSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true
    },
    modules: {
        caps: {
            enabled: { type: Boolean, default: false },
            threshold: { type: Number, default: 70 } // Percentage of caps
        },
        spam: {
            enabled: { type: Boolean, default: false },
            threshold: { type: Number, default: 3 }, // Messages in timeframe
            timeframe: { type: Number, default: 5000 } // Milliseconds
        },
        spoilers: {
            enabled: { type: Boolean, default: false }
        },
        regex: {
            enabled: { type: Boolean, default: false },
            pattern: { type: String, default: '' }
        },
        snipe: {
            enabled: { type: Boolean, default: false }
        },
        massmention: {
            enabled: { type: Boolean, default: false },
            threshold: { type: Number, default: 5 } // Max mentions
        },
        musicfiles: {
            enabled: { type: Boolean, default: false }
        },
        emoji: {
            enabled: { type: Boolean, default: false },
            threshold: { type: Number, default: 10 } // Max emojis
        },
        invites: {
            enabled: { type: Boolean, default: false }
        },
        links: {
            enabled: { type: Boolean, default: false }
        }
    },
    customWords: [{
        type: String
    }],
    whitelistChannels: [{
        type: String
    }],
    whitelistRoles: [{
        type: String
    }],
    punishments: {
        firstOffense: {
            type: String,
            enum: ['warn', 'mute', 'kick', 'ban', 'delete'],
            default: 'delete'
        },
        secondOffense: {
            type: String,
            enum: ['warn', 'mute', 'kick', 'ban', 'delete'],
            default: 'warn'
        },
        thirdOffense: {
            type: String,
            enum: ['warn', 'mute', 'kick', 'ban', 'delete'],
            default: 'mute'
        },
        muteDuration: { type: Number, default: 600000 } // 10 minutes in milliseconds
    },
    logChannel: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Static methods for easier interaction
filterConfigSchema.statics.getOrCreateConfig = async function(guildId) {
    try {
        let config = await this.findOne({ guildId });
        if (!config) {
            config = new this({ guildId });
            await config.save();
        }
        return config;
    } catch (error) {
        console.error('Error getting/creating filter config:', error);
        throw error;
    }
};

filterConfigSchema.statics.enableModule = async function(guildId, moduleType) {
    try {
        const config = await this.getOrCreateConfig(guildId);
        config.modules[moduleType].enabled = true;
        await config.save();
        return config;
    } catch (error) {
        console.error('Error enabling filter module:', error);
        throw error;
    }
};

filterConfigSchema.statics.disableModule = async function(guildId, moduleType) {
    try {
        const config = await this.getOrCreateConfig(guildId);
        config.modules[moduleType].enabled = false;
        await config.save();
        return config;
    } catch (error) {
        console.error('Error disabling filter module:', error);
        throw error;
    }
};

filterConfigSchema.statics.updateModuleConfig = async function(guildId, moduleType, updates) {
    try {
        const config = await this.getOrCreateConfig(guildId);
        Object.assign(config.modules[moduleType], updates);
        await config.save();
        return config;
    } catch (error) {
        console.error('Error updating filter module config:', error);
        throw error;
    }
};

filterConfigSchema.statics.addCustomWord = async function(guildId, word) {
    try {
        const config = await this.getOrCreateConfig(guildId);
        if (!config.customWords.includes(word)) {
            config.customWords.push(word);
            await config.save();
        }
        return config;
    } catch (error) {
        console.error('Error adding custom word:', error);
        throw error;
    }
};

filterConfigSchema.statics.removeCustomWord = async function(guildId, word) {
    try {
        const config = await this.getOrCreateConfig(guildId);
        config.customWords = config.customWords.filter(w => w !== word);
        await config.save();
        return config;
    } catch (error) {
        console.error('Error removing custom word:', error);
        throw error;
    }
};

filterConfigSchema.statics.addWhitelistChannel = async function(guildId, channelId) {
    try {
        const config = await this.getOrCreateConfig(guildId);
        if (!config.whitelistChannels.includes(channelId)) {
            config.whitelistChannels.push(channelId);
            await config.save();
        }
        return config;
    } catch (error) {
        console.error('Error adding whitelist channel:', error);
        throw error;
    }
};

filterConfigSchema.statics.removeWhitelistChannel = async function(guildId, channelId) {
    try {
        const config = await this.getOrCreateConfig(guildId);
        config.whitelistChannels = config.whitelistChannels.filter(id => id !== channelId);
        await config.save();
        return config;
    } catch (error) {
        console.error('Error removing whitelist channel:', error);
        throw error;
    }
};

filterConfigSchema.statics.addWhitelistRole = async function(guildId, roleId) {
    try {
        const config = await this.getOrCreateConfig(guildId);
        if (!config.whitelistRoles.includes(roleId)) {
            config.whitelistRoles.push(roleId);
            await config.save();
        }
        return config;
    } catch (error) {
        console.error('Error adding whitelist role:', error);
        throw error;
    }
};

filterConfigSchema.statics.removeWhitelistRole = async function(guildId, roleId) {
    try {
        const config = await this.getOrCreateConfig(guildId);
        config.whitelistRoles = config.whitelistRoles.filter(id => id !== roleId);
        await config.save();
        return config;
    } catch (error) {
        console.error('Error removing whitelist role:', error);
        throw error;
    }
};

filterConfigSchema.statics.isWhitelisted = async function(guildId, member, channel) {
    try {
        const config = await this.getOrCreateConfig(guildId);
        
        // Check if channel is whitelisted
        if (config.whitelistChannels.includes(channel.id)) {
            return true;
        }
        
        // Check if user has a whitelisted role
        const memberRoles = member.roles.cache.map(role => role.id);
        const hasWhitelistedRole = config.whitelistRoles.some(roleId => memberRoles.includes(roleId));
        
        return hasWhitelistedRole;
    } catch (error) {
        console.error('Error checking whitelist:', error);
        return false;
    }
};

module.exports = mongoose.model('FilterConfig', filterConfigSchema);
