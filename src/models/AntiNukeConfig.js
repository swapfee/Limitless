const mongoose = require('mongoose');

const antiNukeConfigSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    enabled: {
        type: Boolean,
        default: true
    },
    limits: {
        channelDelete: {
            enabled: { type: Boolean, default: true },
            max: { type: Number, default: 3 }
        },
        channelCreate: {
            enabled: { type: Boolean, default: true },
            max: { type: Number, default: 5 }
        },
        roleDelete: {
            enabled: { type: Boolean, default: true },
            max: { type: Number, default: 2 }
        },
        roleCreate: {
            enabled: { type: Boolean, default: true },
            max: { type: Number, default: 5 }
        },
        memberKick: {
            enabled: { type: Boolean, default: true },
            max: { type: Number, default: 5 }
        },
        memberBan: {
            enabled: { type: Boolean, default: true },
            max: { type: Number, default: 3 }
        },
        webhookCreate: {
            enabled: { type: Boolean, default: true },
            max: { type: Number, default: 3 }
        },
        webhookDelete: {
            enabled: { type: Boolean, default: true },
            max: { type: Number, default: 5 }
        },
        emojiDelete: {
            enabled: { type: Boolean, default: true },
            max: { type: Number, default: 5 }
        },
        guildUpdate: {
            enabled: { type: Boolean, default: true },
            max: { type: Number, default: 2 }
        },
        roleUpdate: {
            enabled: { type: Boolean, default: true },
            max: { type: Number, default: 3 }
        }
    },
    // Punishment settings
    punishment: {
        type: {
            type: String,
            enum: ['none', 'kick', 'ban', 'strip_permissions', 'jail', 'jail_and_strip'],
            default: 'strip_permissions'
        },
        stripDangerousPerms: {
            type: Boolean,
            default: true
        },
        jailDuration: {
            type: Number,
            default: 3600 // seconds (1 hour default)
        },
        notifyUser: {
            type: Boolean,
            default: true
        }
    },
    // Whitelist settings
    whitelist: {
        users: [String], // User IDs
        bypassOwner: { type: Boolean, default: true },
        bypassBots: { type: Boolean, default: false }
    },
    // Admin settings
    adminUsers: [String], // User IDs who can configure antinuke settings
    // Logging settings
    logging: {
        enabled: { type: Boolean, default: true },
        logActions: { type: Boolean, default: true },
        logPunishments: { type: Boolean, default: true }
    }
}, {
    timestamps: true,
    versionKey: false
});

// Static method to get or create config
antiNukeConfigSchema.statics.getOrCreateConfig = async function(guildId) {
    let config = await this.findOne({ guildId });
    
    if (!config) {
        config = new this({ guildId });
        await config.save();
    }
    
    return config;
};

// Method to check if user is whitelisted
antiNukeConfigSchema.methods.isWhitelisted = function(userId, userRoles = [], isOwner = false, isBot = false) {
    // Check owner bypass
    if (isOwner && this.whitelist.bypassOwner) {
        return true;
    }
    
    // Check bot bypass
    if (isBot && this.whitelist.bypassBots) {
        return true;
    }
    
    // Check user whitelist
    if (this.whitelist.users.includes(userId)) {
        return true;
    }
    
    return false;
};

// Method to add user to whitelist
antiNukeConfigSchema.methods.addUserWhitelist = async function(userId) {
    if (!this.whitelist.users.includes(userId)) {
        this.whitelist.users.push(userId);
        await this.save();
    }
};

// Method to remove user from whitelist
antiNukeConfigSchema.methods.removeUserWhitelist = async function(userId) {
    this.whitelist.users = this.whitelist.users.filter(id => id !== userId);
    await this.save();
};

// Method to check if user is antinuke admin
antiNukeConfigSchema.methods.isAntiNukeAdmin = function(userId, isOwner = false) {
    // Owner is always admin
    if (isOwner) {
        return true;
    }
    
    // Check if user is in admin list
    return this.adminUsers.includes(userId);
};

// Method to add antinuke admin
antiNukeConfigSchema.methods.addAntiNukeAdmin = async function(userId) {
    if (!this.adminUsers.includes(userId)) {
        this.adminUsers.push(userId);
        await this.save();
    }
};

// Method to remove antinuke admin
antiNukeConfigSchema.methods.removeAntiNukeAdmin = async function(userId) {
    this.adminUsers = this.adminUsers.filter(id => id !== userId);
    await this.save();
};

// Method to update limit settings
antiNukeConfigSchema.methods.updateLimit = async function(actionType, enabled, max) {
    if (this.limits[actionType]) {
        if (enabled !== undefined) this.limits[actionType].enabled = enabled;
        if (max !== undefined) this.limits[actionType].max = max;
        await this.save();
    }
};

// Method to get action limit
antiNukeConfigSchema.methods.getLimit = function(actionType) {
    return this.limits[actionType] || null;
};

module.exports = mongoose.model('AntiNukeConfig', antiNukeConfigSchema);
