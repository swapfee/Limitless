const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    embedColor: {
        type: String,
        default: '#722F37', // Wine red color
        validate: {
            validator: function(v) {
                // Validate hex color format
                return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
            },
            message: 'Embed color must be a valid hex color code (e.g., #722F37)'
        }
    }
}, {
    timestamps: true, // Adds createdAt and updatedAt fields
    versionKey: false // Removes the __v field
});

guildConfigSchema.statics.getGuildConfig = async function(guildId) {
    let config = await this.findOne({ guildId });
    
    if (!config) {
        config = new this({ guildId });
        await config.save();
    }
    
    return config;
};

// Instance method to get embed color as integer for Discord
guildConfigSchema.methods.getEmbedColorInt = function() {
    return parseInt(this.embedColor.replace('#', ''), 16);
};

// Instance method to update embed color
guildConfigSchema.methods.setEmbedColor = async function(color) {
    this.embedColor = color;
    return await this.save();
};

module.exports = mongoose.model('GuildConfig', guildConfigSchema);
