const { Events, ChannelType } = require('discord.js');

module.exports = {
    name: Events.ChannelCreate,
    async execute(channel) {
        // Only handle text and voice channels in guilds
        if (!channel.guild || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildVoice)) {
            return;
        }
        
        const guild = channel.guild;
        
        try {
            // Get the moderation roles
            const mutedRole = guild.roles.cache.find(role => role.name === 'mute');
            const imageMutedRole = guild.roles.cache.find(role => role.name === 'imute');
            const reactionMutedRole = guild.roles.cache.find(role => role.name === 'rmute');
            const jailedRole = guild.roles.cache.find(role => role.name === 'Jailed');
            
            // Configure permissions for each mute role
            const permissionPromises = [];
            
            // Muted role permissions
            if (mutedRole) {
                permissionPromises.push(
                    channel.permissionOverwrites.create(mutedRole, {
                        SendMessages: false,
                        Speak: false
                    }).catch(error => {
                        console.error(`Failed to set mute permissions for #${channel.name}:`, error);
                    })
                );
            }
            
            // Image Muted role permissions
            if (imageMutedRole) {
                permissionPromises.push(
                    channel.permissionOverwrites.create(imageMutedRole, {
                        AttachFiles: false,
                        EmbedLinks: false
                    }).catch(error => {
                        console.error(`Failed to set imute permissions for #${channel.name}:`, error);
                    })
                );
            }
            
            // Reaction Muted role permissions
            if (reactionMutedRole) {
                permissionPromises.push(
                    channel.permissionOverwrites.create(reactionMutedRole, {
                        AddReactions: false
                    }).catch(error => {
                        console.error(`Failed to set rmute permissions for #${channel.name}:`, error);
                    })
                );
            }
            
            // Jailed role permissions (deny access to all channels except jail)
            if (jailedRole && channel.name !== 'jail') {
                permissionPromises.push(
                    channel.permissionOverwrites.create(jailedRole, {
                        ViewChannel: false
                    }).catch(error => {
                        console.error(`Failed to set jailed permissions for #${channel.name}:`, error);
                    })
                );
            }
            
            // Special handling for jail channel
            if (jailedRole && channel.name === 'jail') {
                permissionPromises.push(
                    channel.permissionOverwrites.create(jailedRole, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    }).catch(error => {
                        console.error(`Failed to set jail permissions for #${channel.name}:`, error);
                    })
                );
                
                // Deny everyone else access to jail channel
                permissionPromises.push(
                    channel.permissionOverwrites.create(guild.roles.everyone, {
                        ViewChannel: false
                    }).catch(error => {
                        console.error(`Failed to set everyone permissions for #${channel.name}:`, error);
                    })
                );
            }
            
            // Execute all permission changes
            await Promise.all(permissionPromises);
            
            console.log(`✅ Auto-configured moderation permissions for new channel: #${channel.name}`);
            
        } catch (error) {
            console.error(`❌ Failed to auto-configure permissions for channel #${channel.name}:`, error);
        }
    },
};
