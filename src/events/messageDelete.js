const { Events } = require('discord.js');
const FilterConfig = require('../models/FilterConfig');

// Store for tracking deleted messages (in-memory for this example)
// In production, you might want to use Redis or a database
const deletedMessages = new Map();
const editedMessages = new Map();

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        // Only track messages in guilds
        if (!message.guild) return;
        
        // Don't track bot messages
        if (message.author?.bot) return;

        try {
            const config = await FilterConfig.getOrCreateConfig(message.guild.id);
            
            // Check if snipe filter is enabled
            if (!config.modules.snipe.enabled) return;
            
            // Check if channel/user is whitelisted
            if (message.member) {
                const isWhitelisted = await FilterConfig.isWhitelisted(
                    message.guild.id,
                    message.member,
                    message.channel
                );
                if (isWhitelisted) return;
            }
            
            // Store the deleted message data
            const messageData = {
                content: message.content,
                author: {
                    id: message.author?.id,
                    tag: message.author?.tag,
                    displayName: message.member?.displayName || message.author?.username
                },
                channel: {
                    id: message.channel.id,
                    name: message.channel.name
                },
                deletedAt: Date.now(),
                attachments: message.attachments.map(att => ({
                    name: att.name,
                    url: att.url,
                    size: att.size
                }))
            };
            
            // Store with channel-specific key
            const channelKey = `${message.guild.id}-${message.channel.id}`;
            if (!deletedMessages.has(channelKey)) {
                deletedMessages.set(channelKey, []);
            }
            
            const channelDeleted = deletedMessages.get(channelKey);
            channelDeleted.unshift(messageData); // Add to beginning
            
            // Keep only last 10 deleted messages per channel
            if (channelDeleted.length > 10) {
                channelDeleted.splice(10);
            }
            
            // Clean up old messages (older than 1 hour)
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            const filtered = channelDeleted.filter(msg => msg.deletedAt > oneHourAgo);
            deletedMessages.set(channelKey, filtered);
            
        } catch (error) {
            console.error('Error in snipe protection (message delete):', error);
        }
    }
};

// Additional event for message edits
const messageEditEvent = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        // Only track messages in guilds
        if (!newMessage.guild) return;
        
        // Don't track bot messages
        if (newMessage.author?.bot) return;
        
        // Ignore if content hasn't changed
        if (oldMessage.content === newMessage.content) return;

        try {
            const config = await FilterConfig.getOrCreateConfig(newMessage.guild.id);
            
            // Check if snipe filter is enabled
            if (!config.modules.snipe.enabled) return;
            
            // Check if channel/user is whitelisted
            if (newMessage.member) {
                const isWhitelisted = await FilterConfig.isWhitelisted(
                    newMessage.guild.id,
                    newMessage.member,
                    newMessage.channel
                );
                if (isWhitelisted) return;
            }
            
            // Store the edited message data
            const editData = {
                oldContent: oldMessage.content,
                newContent: newMessage.content,
                author: {
                    id: newMessage.author?.id,
                    tag: newMessage.author?.tag,
                    displayName: newMessage.member?.displayName || newMessage.author?.username
                },
                channel: {
                    id: newMessage.channel.id,
                    name: newMessage.channel.name
                },
                editedAt: Date.now(),
                messageId: newMessage.id
            };
            
            // Store with channel-specific key
            const channelKey = `${newMessage.guild.id}-${newMessage.channel.id}`;
            if (!editedMessages.has(channelKey)) {
                editedMessages.set(channelKey, []);
            }
            
            const channelEdited = editedMessages.get(channelKey);
            channelEdited.unshift(editData); // Add to beginning
            
            // Keep only last 10 edited messages per channel
            if (channelEdited.length > 10) {
                channelEdited.splice(10);
            }
            
            // Clean up old messages (older than 1 hour)
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            const filtered = channelEdited.filter(msg => msg.editedAt > oneHourAgo);
            editedMessages.set(channelKey, filtered);
            
        } catch (error) {
            console.error('Error in snipe protection (message edit):', error);
        }
    }
};

// Export both events
module.exports.messageEditEvent = messageEditEvent;

// Utility functions for other parts of the bot to access snipe data
module.exports.getDeletedMessages = (guildId, channelId) => {
    const channelKey = `${guildId}-${channelId}`;
    return deletedMessages.get(channelKey) || [];
};

module.exports.getEditedMessages = (guildId, channelId) => {
    const channelKey = `${guildId}-${channelId}`;
    return editedMessages.get(channelKey) || [];
};

module.exports.clearSnipeData = (guildId, channelId) => {
    const channelKey = `${guildId}-${channelId}`;
    deletedMessages.delete(channelKey);
    editedMessages.delete(channelKey);
};

// Anti-snipe command handler
module.exports.handleSnipeCommand = async (message) => {
    try {
        const config = await FilterConfig.getOrCreateConfig(message.guild.id);
        
        // Check if snipe filter is enabled
        if (!config.modules.snipe.enabled) return false;
        
        // Check if this is a snipe command
        const content = message.content.toLowerCase();
        const snipeCommands = ['snipe', 'editsnipe', 's', 'es'];
        const isSnipeCommand = snipeCommands.some(cmd => 
            content.startsWith(`!${cmd}`) || 
            content.startsWith(`.${cmd}`) || 
            content.startsWith(`?${cmd}`) ||
            content.startsWith(`${cmd}`)
        );
        
        if (isSnipeCommand) {
            // Delete the snipe command
            await message.delete().catch(() => {});
            
            // Clear snipe data for this channel to prevent snipe bots from working
            module.exports.clearSnipeData(message.guild.id, message.channel.id);
            
            // Send temporary warning
            const warningMsg = await message.channel.send({
                content: `⚠️ ${message.author}, snipe commands are disabled in this server.`
            });
            
            // Delete warning after 5 seconds
            setTimeout(async () => {
                try {
                    await warningMsg.delete();
                } catch (error) {
                    // Ignore errors
                }
            }, 5000);
            
            return true; // Indicates snipe command was handled
        }
        
        return false;
    } catch (error) {
        console.error('Error handling snipe command:', error);
        return false;
    }
};
