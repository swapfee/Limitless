require('dotenv').config();
const { REST, Routes } = require('discord.js');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🗑️ Started clearing application (/) commands.');

        if (process.env.GUILD_ID && process.env.GUILD_ID !== 'your_guild_id_here_for_testing') {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: [] }
            );
            console.log('✅ Successfully cleared guild application (/) commands.');
        }
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] }
        );
        console.log('✅ Successfully cleared global application (/) commands.');
    } catch (error) {
        console.error('❌ Error clearing commands:', error);
    }
})();
