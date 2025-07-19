const { EmbedBuilder } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');

/**
 * Creates a standard embed with the guild's custom color
 * @param {string} guildId - The guild ID
 * @param {Object} options - Embed options
 * @returns {Promise<EmbedBuilder>} - Configured embed
 */
async function createEmbed(guildId, options = {}) {
    const config = await GuildConfig.getGuildConfig(guildId);
    const embed = new EmbedBuilder();
    
    // Set the guild's custom color
    embed.setColor(config.getEmbedColorInt());
    
    // Apply any provided options
    if (options.title) embed.setTitle(options.title);
    if (options.description) embed.setDescription(options.description);
    if (options.thumbnail) embed.setThumbnail(options.thumbnail);
    if (options.image) embed.setImage(options.image);
    if (options.footer) embed.setFooter(options.footer);
    if (options.author) embed.setAuthor(options.author);
    if (options.timestamp) embed.setTimestamp(options.timestamp);
    if (options.fields) {
        options.fields.forEach(field => embed.addFields(field));
    }
    
    return embed;
}

/**
 * Creates a success embed with green color
 * @param {string} title - Embed title
 * @param {string} description - Embed description
 * @returns {EmbedBuilder} - Success embed
 */
function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setColor('#28a745') // Success green
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Creates an error embed with red color
 * @param {string} title - Embed title
 * @param {string} description - Embed description
 * @returns {EmbedBuilder} - Error embed
 */
function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor('#dc3545') // Error red
        .setTitle(`${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Creates a warning embed with yellow color
 * @param {string} title - Embed title
 * @param {string} description - Embed description
 * @returns {EmbedBuilder} - Warning embed
 */
function createWarningEmbed(title, description) {
    return new EmbedBuilder()
        .setColor('#ffc107') // Warning yellow
        .setTitle(`⚠️ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Creates an info embed with blue color
 * @param {string} title - Embed title
 * @param {string} description - Embed description
 * @returns {EmbedBuilder} - Info embed
 */
function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor('#17a2b8') // Info blue
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

module.exports = {
    createEmbed,
    createSuccessEmbed,
    createErrorEmbed,
    createWarningEmbed,
    createInfoEmbed
};
