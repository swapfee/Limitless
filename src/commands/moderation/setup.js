const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require('../../utils/embedUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Set up moderation system with roles and channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const guild = interaction.guild;
        const setupResults = {
            roles: [],
            channels: [],
            errors: []
        };
        
        try {
            // Create moderation roles
            const rolesToCreate = [
                {
                    name: 'mute',
                    description: 'Used to restrict users from sending messages'
                },
                {
                    name: 'imute',
                    description: 'Used to restrict users from uploading attachments'
                },
                {
                    name: 'rmute',
                    description: 'Used to restrict users from reacting to messages'
                },
                {
                    name: 'Jailed',
                    description: 'Used to restrict users from all channels except jail'
                }
            ];
            
            // Create roles with NO permissions
            for (const roleData of rolesToCreate) {
                try {
                    // Check if role already exists
                    let existingRole = guild.roles.cache.find(role => role.name === roleData.name);
                    
                    if (!existingRole) {
                        const newRole = await guild.roles.create({
                            name: roleData.name,
                            permissions: [], // Explicitly set no permissions
                            reason: 'Moderation system setup'
                        });
                        setupResults.roles.push(`Created role: ${roleData.name}`);
                    } else {
                        // Check if role has any permissions that need to be cleared
                        const hasPermissions = existingRole.permissions.bitfield !== 0n;
                        
                        if (hasPermissions) {
                            // Update existing role to have no permissions
                            await existingRole.setPermissions([], 'Moderation system setup - removing all permissions');
                            setupResults.roles.push(`Role updated: ${roleData.name} (permissions cleared)`);
                        } else {
                            // Role already has no permissions
                            setupResults.roles.push(`Role already exists: ${roleData.name}`);
                        }
                    }
                } catch (error) {
                    setupResults.errors.push(`Failed to create/update role ${roleData.name}: ${error.message}`);
                }
            }
            
            // Create moderation channels
            const channelsToCreate = [
                {
                    name: 'jail-log',
                    type: ChannelType.GuildText,
                    description: 'Logs all moderation actions done through the bot'
                },
                {
                    name: 'jail',
                    type: ChannelType.GuildText,
                    description: 'Where jailed users are restricted to'
                }
            ];
            
            for (const channelData of channelsToCreate) {
                try {
                    // Check if channel already exists
                    let existingChannel = guild.channels.cache.find(channel => channel.name === channelData.name);
                    
                    if (!existingChannel) {
                        await guild.channels.create({
                            name: channelData.name,
                            type: channelData.type,
                            reason: 'Moderation system setup'
                        });
                        setupResults.channels.push(`Created channel: #${channelData.name}`);
                    } else {
                        setupResults.channels.push(`Channel already exists: #${channelData.name}`);
                    }
                } catch (error) {
                    setupResults.errors.push(`Failed to create channel ${channelData.name}: ${error.message}`);
                }
            }
            
            await setupPermissions(guild, setupResults);
            
            const embed = await createEmbed(guild.id, {
                title: 'Moderation System Setup Complete',
                description: 'Your server has been configured with moderation roles and channels.',
                fields: [
                    {
                        name: 'Roles Created/Verified',
                        value: setupResults.roles.join('\n') || 'None',
                        inline: false
                    },
                    {
                        name: 'Channels Created/Verified', 
                        value: setupResults.channels.join('\n') || 'None',
                        inline: false
                    },
                    {
                        name: 'Role Descriptions',
                        value: '**mute** - Restricts users from sending messages\n**imute** - Restricts users from uploading attachments\n**rmute** - Restricts users from reacting to messages\n**Jailed** - Restricts users from all channels except #jail',
                        inline: false
                    },
                    {
                        name: 'Channel Purposes',
                        value: '**#jail-log** - Logs all moderation actions\n**#jail** - Where jailed users are restricted to',
                        inline: false
                    }
                ]
            });
            
            if (setupResults.errors.length > 0) {
                embed.addFields({
                    name: 'Errors Encountered',
                    value: setupResults.errors.join('\n'),
                    inline: false
                });
            }
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error in setup command:', error);
            const errorEmbed = createErrorEmbed(
                'Setup Failed',
                `An error occurred during setup: ${error.message}`
            );
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};

async function setupPermissions(guild, setupResults) {
    try {
        // Get the created/existing roles
        const mutedRole = guild.roles.cache.find(role => role.name === 'mute');
        const imageMutedRole = guild.roles.cache.find(role => role.name === 'imute');
        const reactionMutedRole = guild.roles.cache.find(role => role.name === 'rmute');
        const jailedRole = guild.roles.cache.find(role => role.name === 'Jailed');
        const jailChannel = guild.channels.cache.find(channel => channel.name === 'jail');
        
        // Set up permissions for all channels
        for (const channel of guild.channels.cache.values()) {
            if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice) {
                try {
                    if (mutedRole) {
                        await channel.permissionOverwrites.create(mutedRole, {
                            SendMessages: false,
                            Speak: false
                        });
                    }
                    
                    if (imageMutedRole) {
                        await channel.permissionOverwrites.create(imageMutedRole, {
                            AttachFiles: false,
                            EmbedLinks: false
                        });
                    }
                    
                    if (reactionMutedRole) {
                        await channel.permissionOverwrites.create(reactionMutedRole, {
                            AddReactions: false
                        });
                    }
                    
                    if (jailedRole && channel.name !== 'jail') {
                        await channel.permissionOverwrites.create(jailedRole, {
                            ViewChannel: false
                        });
                    }
                    
                } catch (error) {
                    setupResults.errors.push(`Permission setup failed for #${channel.name}`);
                }
            }
        }
        
        if (jailChannel && jailedRole) {
            try {
                const existingJailedPermissions = jailChannel.permissionOverwrites.cache.get(jailedRole.id);
                const existingEveryonePermissions = jailChannel.permissionOverwrites.cache.get(guild.roles.everyone.id);
                
                let permissionsChanged = false;
                
                if (!existingJailedPermissions || 
                    existingJailedPermissions.allow.has('ViewChannel') !== true ||
                    existingJailedPermissions.allow.has('SendMessages') !== true ||
                    existingJailedPermissions.deny.has('AttachFiles') !== true ||
                    existingJailedPermissions.deny.has('ReadMessageHistory') !== true) {
                    
                    await jailChannel.permissionOverwrites.create(jailedRole, {
                        ViewChannel: true,
                        SendMessages: true,
                        AttachFiles: false,
                        ReadMessageHistory: false
                    });
                    permissionsChanged = true;
                }
                
                if (!existingEveryonePermissions || 
                    existingEveryonePermissions.deny.has('ViewChannel') !== true) {
                    
                    await jailChannel.permissionOverwrites.create(guild.roles.everyone, {
                        ViewChannel: false
                    });
                    permissionsChanged = true;
                }
                
                if (permissionsChanged) {
                    setupResults.roles.push('Jail channel permissions updated');
                } else {
                    setupResults.roles.push('Jail channel permissions already configured');
                }
                
            } catch (error) {
                setupResults.errors.push(`Failed to set jail channel permissions`);
            }
        }
        
        setupResults.roles.push('Permissions configured for all channels');
        
    } catch (error) {
        setupResults.errors.push(`Permission setup failed: ${error.message}`);
    }
}
