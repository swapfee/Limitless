const { Events } = require('discord.js');
const FilterUtils = require('../utils/filterUtils');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Ignore bots and system messages
        if (message.author.bot || message.system) return;
        
        // Only process messages in guilds
        if (!message.guild) return;

        try {
            // Process all filters for the message
            const result = await FilterUtils.processMessage(message);
            
            // If violations were found, handle them
            if (result) {
                await FilterUtils.handleViolations(message, result.violations, result.config);
            }

        } catch (error) {
            console.error('Error in message filter:', error);
        }
    },
};


