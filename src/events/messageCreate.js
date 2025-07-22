const { Events } = require('discord.js');
const { handleSnipeCommand } = require('./messageDelete');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Ignore bots and system messages
        if (message.author.bot || message.system) return;
        
        // Only process messages in guilds
        if (!message.guild) return;

        try {
            // Check if this is a snipe command and handle it
            await handleSnipeCommand(message);
            
        } catch (error) {
            console.error('Error in message create handler:', error);
        }
    },
};
