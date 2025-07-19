require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];

function loadCommands(dir) {
    const commandFolders = fs.readdirSync(dir);
    
    for (const folder of commandFolders) {
        const folderPath = path.join(dir, folder);
        const stat = fs.statSync(folderPath);
        
        if (stat.isDirectory()) {
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
            
            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                const command = require(filePath);
                
                if ('data' in command && 'execute' in command) {
                    commands.push(command.data.toJSON());
                    console.log(`✅ Loaded command for deployment: ${command.data.name}`);
                } else {
                    console.log(`⚠️  The command at ${filePath} is missing a required "data" or "execute" property.`);
                }
            }
        }
    }
}

// Load commands from the commands directory
const commandsPath = path.join(__dirname, 'src', 'commands');
if (fs.existsSync(commandsPath)) {
    loadCommands(commandsPath);
} else {
    console.log('Commands directory not found!');
    process.exit(1);
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Deploy commands
(async () => {
    try {
        console.log(`🚀 Started refreshing ${commands.length} application (/) commands.`);

        // Choose deployment type based on environment variable
        if (process.env.GUILD_ID) {
            // Deploy to specific guild (faster for development)
            const data = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands },
            );
            console.log(`✅ Successfully reloaded ${data.length} guild application (/) commands.`);
        } else {
            // Deploy globally (takes up to 1 hour to propagate)
            const data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands },
            );
            console.log(`✅ Successfully reloaded ${data.length} global application (/) commands.`);
        }
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();
