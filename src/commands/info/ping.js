const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embedUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong! and shows bot latency'),
    
    async execute(interaction) {
        await interaction.reply('🏓 Pinging...');
        
        const sent = await interaction.fetchReply();
        const timeTaken = sent.createdTimestamp - interaction.createdTimestamp;
        
        const embed = await createEmbed(interaction.guild.id, {
            title: '🏓 Pong!',
            description: `**Latency Information**`,
            fields: [
                {
                    name: '📶 Bot Latency',
                    value: `${timeTaken}ms`,
                    inline: true
                },
                {
                    name: '💓 API Latency',
                    value: `${Math.round(interaction.client.ws.ping)}ms`,
                    inline: true
                }
            ],
            timestamp: new Date()
        });
        
        await interaction.editReply({
            content: null,
            embeds: [embed]
        });
    },
};
