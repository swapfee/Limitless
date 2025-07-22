const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, InteractionResponseFlags } = require('discord.js');
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const JailConfig = require('../../models/JailConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Set up moderation system with roles and channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const guild = interaction.guild;
        
        // Defer the reply immediately to prevent timeout
        await interaction.deferReply();
        
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
                    description: 'Logs all moderation actions done through the bot',
                    private: true // This channel should be private from @everyone
                },
                {
                    name: 'jail',
                    type: ChannelType.GuildText,
                    description: 'Where jailed users are restricted to',
                    private: false
                }
            ];
            
            for (const channelData of channelsToCreate) {
                try {
                    let existingChannel = guild.channels.cache.find(channel => channel.name === channelData.name);
                    
                    if (!existingChannel) {
                        const channelOptions = {
                            name: channelData.name,
                            type: channelData.type,
                            reason: 'Moderation system setup'
                        };
                        
                        // Set initial permissions for private channels
                        if (channelData.private) {
                            channelOptions.permissionOverwrites = [
                                {
                                    id: guild.roles.everyone.id,
                                    deny: [PermissionFlagsBits.ViewChannel]
                                }
                            ];
                        }
                        
                        await guild.channels.create(channelOptions);
                        setupResults.channels.push(`Created channel: #${channelData.name}${channelData.private ? ' (private)' : ''}`);
                    } else {
                        setupResults.channels.push(`Channel already exists: #${channelData.name}`);
                    }
                } catch (error) {
                    setupResults.errors.push(`Failed to create channel ${channelData.name}: ${error.message}`);
                }
            }
            
            await setupPermissions(guild, setupResults);
            
            // Save jail configuration to database
            try {
                const jailChannel = guild.channels.cache.find(channel => channel.name === 'jail');
                const jailLogChannel = guild.channels.cache.find(channel => channel.name === 'jail-log');
                const jailedRole = guild.roles.cache.find(role => role.name === 'Jailed');
                
                if (jailChannel) {
                    await JailConfig.setJailChannel(guild.id, jailChannel.id);
                    setupResults.roles.push('Jail channel saved to database');
                }
                
                if (jailLogChannel) {
                    await JailConfig.setJailLogChannel(guild.id, jailLogChannel.id);
                    setupResults.roles.push('Jail log channel saved to database');
                }
                
                if (jailedRole) {
                    await JailConfig.setJailRole(guild.id, jailedRole.id);
                    setupResults.roles.push('Jailed role saved to database');
                }
                
                // Also check for existing channels from database and update permissions
                await updateExistingChannelPermissions(guild, setupResults);
                
            } catch (error) {
                setupResults.errors.push(`Failed to save jail configuration to database: ${error.message}`);
            }
            
            const embed = await createEmbed(guild.id, {
                title: 'Setup Complete',
                description: 'Moderation system has been successfully configured with all necessary roles and channels.'
            });
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error in setup command:', error);
            const errorEmbed = createErrorEmbed(
                'Setup Failed',
                `An error occurred during setup: ${error.message}`
            );
            
            try {
                if (interaction.deferred) {
                    return interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    return interaction.reply({ embeds: [errorEmbed], flags: InteractionResponseFlags.Ephemeral });
                }
            } catch (replyError) {
                console.error('Failed to send error response:', replyError);
            }
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
        
        // Set up jail-log channel permissions (make it private from @everyone)
        const jailLogChannel = guild.channels.cache.find(channel => channel.name === 'jail-log');
        if (jailLogChannel) {
            try {
                const existingEveryonePermissions = jailLogChannel.permissionOverwrites.cache.get(guild.roles.everyone.id);
                
                if (!existingEveryonePermissions || 
                    existingEveryonePermissions.deny.has('ViewChannel') !== true) {
                    
                    await jailLogChannel.permissionOverwrites.create(guild.roles.everyone, {
                        ViewChannel: false
                    });
                    setupResults.roles.push('Jail log channel made private from @everyone');
                } else {
                    setupResults.roles.push('Jail log channel already private from @everyone');
                }
                
            } catch (error) {
                setupResults.errors.push(`Failed to set jail log channel permissions: ${error.message}`);
            }
        }
        
        setupResults.roles.push('Permissions configured for all channels');
        
    } catch (error) {
        setupResults.errors.push(`Permission setup failed: ${error.message}`);
    }
}

/**
 * Update permissions for existing channels that may be configured in the database
 * @param {Guild} guild - The Discord guild
 * @param {Object} setupResults - Results object to log actions to
 */
async function updateExistingChannelPermissions(guild, setupResults) {
    try {
        // Get jail log channel ID from database
        const jailLogChannelId = await JailConfig.getJailLogChannelId(guild.id);
        
        if (jailLogChannelId) {
            const jailLogChannel = guild.channels.cache.get(jailLogChannelId);
            
            if (jailLogChannel) {
                const existingEveryonePermissions = jailLogChannel.permissionOverwrites.cache.get(guild.roles.everyone.id);
                
                if (!existingEveryonePermissions || 
                    existingEveryonePermissions.deny.has('ViewChannel') !== true) {
                    
                    await jailLogChannel.permissionOverwrites.create(guild.roles.everyone, {
                        ViewChannel: false
                    });
                    setupResults.roles.push(`Updated jail log channel permissions (Channel ID: ${jailLogChannelId})`);
                } else {
                    setupResults.roles.push(`Jail log channel permissions already configured (Channel ID: ${jailLogChannelId})`);
                }
            } else {
                setupResults.errors.push(`Jail log channel not found (Channel ID: ${jailLogChannelId} - channel may have been deleted)`);
            }
        }
        
    } catch (error) {
        setupResults.errors.push(`Failed to update existing channel permissions: ${error.message}`);
    }
}
