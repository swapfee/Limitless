const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embedUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Display information about this server'),
    
    async execute(interaction) {
        const guild = interaction.guild;
        
        await guild.members.fetch();
        
        const totalMembers = guild.memberCount;
        const humans = guild.members.cache.filter(member => !member.user.bot).size;
        const bots = guild.members.cache.filter(member => member.user.bot).size;
        
        const totalChannels = guild.channels.cache.size;
        const textChannels = guild.channels.cache.filter(channel => channel.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(channel => channel.type === 2).size;
        const categories = guild.channels.cache.filter(channel => channel.type === 4).size;
        
        const totalRoles = guild.roles.cache.size - 1; // Exclude @everyone role
        
        const boostLevel = guild.premiumTier;
        const boostCount = guild.premiumSubscriptionCount || 0;
        
        const verificationLevels = {
            0: 'None',
            1: 'Low',
            2: 'Medium', 
            3: 'High',
            4: 'Very High'
        };
        
        const shardId = guild.shardId;
        const totalShards = interaction.client.shard ? interaction.client.shard.count : 1;
        
        const embed = await createEmbed(guild.id, {
            title: guild.name,
            description: `Server created on <t:${Math.floor(guild.createdTimestamp / 1000)}:D> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)\n${guild.name} is on bot shard ID: **${shardId}/${totalShards}**`,
            thumbnail: guild.iconURL({ dynamic: true, size: 256 }),
            fields: [
                {
                    name: 'Owner',
                    value: `<@${guild.ownerId}>`,
                    inline: true
                },
                {
                    name: 'Members',
                    value: `**Total:** ${totalMembers}\n**Humans:** ${humans}\n**Bots:** ${bots}`,
                    inline: true
                },
                {
                    name: 'Information',
                    value: `**Verification:** ${verificationLevels[guild.verificationLevel]}\n**Boosts:** ${boostCount} (level ${boostLevel})`,
                    inline: true
                },
                {
                    name: 'Design',
                    value: `**Splash:** N/A\n**Banner:** N/A\n**Icon:** [Click here](${guild.iconURL({ dynamic: true, size: 256 }) || 'N/A'})`,
                    inline: true
                },
                {
                    name: `Channels (${totalChannels})`,
                    value: `**Text:** ${textChannels}\n**Voice:** ${voiceChannels}\n**Category:** ${categories}`,
                    inline: true
                },
                {
                    name: 'Counts',
                    value: `**Roles:** ${totalRoles}/250\n**Emojis:** ${guild.emojis.cache.size}/100\n**Boosters:** ${boostCount}`,
                    inline: true
                }
            ],
            footer: {
                text: `Guild ID: ${guild.id} • Today at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
            }
        });
        
        await interaction.reply({ embeds: [embed] });
    },
};
