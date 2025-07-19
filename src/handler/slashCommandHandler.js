const fs = require('fs');
const path = require('path');

module.exports = (client) => {
    const commandsPath = path.join(__dirname, '..', 'commands');
    
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
                        client.commands.set(command.data.name, command);
                        console.log(`✅ Loaded command: ${command.data.name}`);
                    } else {
                        console.log(`⚠️  The command at ${filePath} is missing a required "data" or "execute" property.`);
                    }
                }
            }
        }
    }
    
    if (fs.existsSync(commandsPath)) {
        loadCommands(commandsPath);
        console.log(`📁 Loaded commands from ${commandsPath}`);
    } else {
        console.log(`⚠️  Commands directory not found: ${commandsPath}`);
    }
};
