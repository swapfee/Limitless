const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`🤖 Bot is ready! Logged in as ${client.user.tag}`);
        console.log(`📊 Serving ${client.guilds.cache.size} servers`);
        console.log(`👥 Watching ${client.users.cache.size} users`);
        
        client.user.setPresence({
            activities: [{
                name: 'with Discord.js',
                type: 'PLAYING'
            }],
            status: 'dnd'
        });
    },
};
