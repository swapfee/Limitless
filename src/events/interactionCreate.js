const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        console.log(`📨 Received interaction: ${interaction.type} - ${interaction.commandName || 'No command'}`);
        
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`❌ No command matching ${interaction.commandName} was found.`);
                console.log(`📋 Available commands: ${Array.from(client.commands.keys()).join(', ')}`);
                return;
            }

            console.log(`✅ Executing command: ${interaction.commandName}`);
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`❌ Error executing ${interaction.commandName}:`, error);
                
                const errorMessage = {
                    content: 'There was an error while executing this command!',
                    ephemeral: true
                };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }
        
        else if (interaction.isButton()) {
            console.log(`Button interaction: ${interaction.customId}`);
        }
        
        else if (interaction.isAnySelectMenu()) {
            console.log(`Select menu interaction: ${interaction.customId}`);
        }
        
        else if (interaction.isModalSubmit()) {
            console.log(`Modal interaction: ${interaction.customId}`);
        }
    },
};
