const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embedUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Display information about a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to get information about')
                .setRequired(false)
        ),
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        
        if (!member) {
            return await interaction.reply({ 
                content: 'User not found in this server!', 
                ephemeral: true 
            });
        }
        
        const createdTimestamp = Math.floor(targetUser.createdTimestamp / 1000);
        const joinedTimestamp = Math.floor(member.joinedTimestamp / 1000);
        
        const daysSinceCreated = Math.floor((Date.now() - targetUser.createdTimestamp) / (1000 * 60 * 60 * 24));
        const daysSinceJoined = Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24));
        
        const roles = member.roles.cache
            .filter(role => role.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString())
            .slice(0, 10); 
        
        const roleCount = member.roles.cache.size - 1; 
        const roleDisplay = roles.length > 0 ? roles.join(', ') : 'None';
        
        const joinPosition = await getJoinPosition(member);
        const mutualServers = await getMutualServers(targetUser, interaction.client);
        
        const embed = await createEmbed(interaction.guild.id, {
            title: `${targetUser.username} (${targetUser.id})`,
            thumbnail: targetUser.displayAvatarURL({ dynamic: true, size: 256 }),
            fields: [
                {
                    name: 'Dates',
                    value: `**Created:** <t:${createdTimestamp}:D>, <t:${createdTimestamp}:t> (${daysSinceCreated === 0 ? 'today' : `${daysSinceCreated} ${daysSinceCreated === 1 ? 'day' : 'days'} ago`})\n**Joined:** <t:${joinedTimestamp}:D>, <t:${joinedTimestamp}:t> (${daysSinceJoined === 0 ? 'today' : `${daysSinceJoined} ${daysSinceJoined === 1 ? 'day' : 'days'} ago`})`,
                    inline: false
                },
                {
                    name: `Roles (${roleCount})`,
                    value: roleDisplay,
                    inline: false
                }
            ],
            footer: {
                text: `Join position: ${joinPosition} • ${mutualServers} mutual servers`
            }
        });
        
        await interaction.reply({ embeds: [embed] });
    },
};

async function getJoinPosition(member) {
    const guild = member.guild;
    await guild.members.fetch();
    
    const membersArray = Array.from(guild.members.cache.values())
        .filter(m => m.joinedTimestamp)
        .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);
    
    return membersArray.findIndex(m => m.id === member.id) + 1;
}

async function getMutualServers(user, client) {
    let mutualCount = 0;
    
    for (const guild of client.guilds.cache.values()) {
        try {
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (member) {
                mutualCount++;
            }
        } catch (error) {
            continue;
        }
    }
    
    return mutualCount;
}
