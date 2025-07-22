const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { hasPermission, canExecuteOn, getLogChannel, getJailChannels } = require('../../utils/permissionUtils');
const { createModerationCase } = require('../../utils/moderationUtils');
const LockdownConfig = require('../../models/LockdownConfig');
const LockedChannel = require('../../models/LockedChannel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lockdown')
        .setDescription('Channel lockdown management system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Lock down a specific channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to lock down')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the lockdown')
                        .setRequired(true)
                        .setMaxLength(500)))
        .addSubcommandGroup(group =>
            group
                .setName('role')
                .setDescription('Manage lockdown roles')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Add a role that can lock channels')
                        .addRoleOption(option =>
                            option.setName('role')
                                .setDescription('The role to add lockdown permissions to')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove lockdown permissions from a role')
                        .addRoleOption(option =>
                            option.setName('role')
                                .setDescription('The role to remove lockdown permissions from')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List all roles with lockdown permissions')))
        .addSubcommandGroup(group =>
            group
                .setName('ignore')
                .setDescription('Manage ignored lockdown channels')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Set a channel to be ignored during unlock all')
                        .addChannelOption(option =>
                            option.setName('channel')
                                .setDescription('The channel to ignore during unlock all')
                                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove a channel from being ignored during unlock all')
                        .addChannelOption(option =>
                            option.setName('channel')
                                .setDescription('The channel to stop ignoring')
                                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('View all ignored lockdown channels')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('all')
                .setDescription('Lock all channels in the server')
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the server-wide lockdown')
                        .setRequired(true)
                        .setMaxLength(500)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('mass')
                .setDescription('Unlock only channels locked via "lockdown all"')
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for unlocking mass locked channels')
                        .setRequired(true)
                        .setMaxLength(500))),
    
    async execute(interaction) {
        const subcommandGroup = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();
        const executor = interaction.member;
        const guild = interaction.guild;

        try {
            if (subcommandGroup === 'role') {
                switch (subcommand) {
                    case 'add':
                        await handleAddLockdownRole(interaction, executor, guild);
                        break;
                    case 'remove':
                        await handleRemoveLockdownRole(interaction, executor, guild);
                        break;
                    case 'list':
                        await handleListLockdownRoles(interaction, executor, guild);
                        break;
                }
            } else if (subcommandGroup === 'ignore') {
                switch (subcommand) {
                    case 'add':
                        await handleAddIgnoredChannel(interaction, executor, guild);
                        break;
                    case 'remove':
                        await handleRemoveIgnoredChannel(interaction, executor, guild);
                        break;
                    case 'list':
                        await handleListIgnoredChannels(interaction, executor, guild);
                        break;
                }
            } else {
                switch (subcommand) {
                    case 'channel':
                        await handleLockChannel(interaction, executor, guild);
                        break;
                    case 'all':
                        await handleLockAll(interaction, executor, guild);
                        break;
                    case 'mass':
                        await handleUnlockMass(interaction, executor, guild);
                        break;
                }
            }
        } catch (error) {
            console.error('Error in lockdown command:', error);
            const errorEmbed = createErrorEmbed(
                'Lockdown System Error',
                'An error occurred while processing the lockdown command.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
};

/**
 * Handle locking a specific channel
 */
async function handleLockChannel(interaction, executor, guild) {
    const targetChannel = interaction.options.getChannel('channel');
    const reason = interaction.options.getString('reason');

    // Check permissions - either real manage_channels or lockdown role
    const permissionCheck = await hasPermission(executor, 'manage_channels');
    const hasLockdownRole = await LockdownConfig.canRoleLockdown(guild.id, executor.roles.cache.map(r => r.id));

    if (!permissionCheck.hasPermission && !hasLockdownRole) {
        const errorEmbed = createErrorEmbed(
            'Insufficient Permissions',
            permissionCheck.reason || 'You need Manage Channels permission or a lockdown role to lock channels.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Check if channel is already locked
    const isLocked = await LockedChannel.isChannelLocked(guild.id, targetChannel.id);
    if (isLocked) {
        const errorEmbed = createErrorEmbed(
            'Channel Already Locked',
            `${targetChannel} is already locked down.`
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Prevent locking jail-related channels
    const jailChannels = await getJailChannels(guild.id, guild);
    if (targetChannel.id === jailChannels.jailChannelId || targetChannel.id === jailChannels.logChannelId) {
        const errorEmbed = createErrorEmbed(
            'Cannot Lock Jail Channel',
            'Jail-related channels cannot be locked to maintain the jail system functionality.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
        // Store original permissions
        const originalPermissions = [];
        
        // Lock the channel by denying send messages for @everyone
        const everyoneRole = guild.roles.everyone;
        const currentPerms = targetChannel.permissionOverwrites.cache.get(everyoneRole.id);
        
        if (currentPerms) {
            originalPermissions.push({
                roleId: everyoneRole.id,
                allowed: currentPerms.allow.bitfield.toString(),
                denied: currentPerms.deny.bitfield.toString()
            });
        }

        await targetChannel.permissionOverwrites.edit(everyoneRole, {
            SendMessages: false,
            SendMessagesInThreads: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false
        });

        // Store in database
        await LockedChannel.lockChannel({
            guildId: guild.id,
            channelId: targetChannel.id,
            executorId: executor.user.id,
            reason: reason,
            lockType: 'individual',
            originalPermissions: originalPermissions
        });

        // Create moderation case
        let caseId;
        try {
            const caseData = {
                guildId: guild.id,
                type: 'lockdown',
                target: { id: targetChannel.id, tag: `#${targetChannel.name}` },
                executor: { id: executor.user.id, tag: executor.user.tag },
                reason: reason,
                additionalInfo: {}
            };
            caseId = await createModerationCase(caseData);
        } catch (error) {
            console.error('Error creating moderation case:', error);
            caseId = Date.now();
        }

        const successEmbed = await createEmbed(guild.id, {
            title: 'Channel Locked Down',
            description: `Successfully locked down ${targetChannel}.`,
            fields: [
                {
                    name: 'Channel',
                    value: `${targetChannel} (${targetChannel.name})`,
                    inline: true
                },
                {
                    name: 'Locked By',
                    value: `${executor.user} (${executor.user.tag})`,
                    inline: true
                },
                {
                    name: 'Case ID',
                    value: `#${caseId}`,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: reason,
                    inline: false
                }
            ],
            color: 0xFFA500, // Orange for lockdown
            timestamp: new Date()
        });

        await interaction.reply({ embeds: [successEmbed] });

        // Log the action
        await logLockdownAction(guild, {
            type: 'Channel Lockdown',
            executor: executor.user,
            channel: targetChannel,
            reason: reason,
            caseId: caseId
        });

    } catch (error) {
        const errorEmbed = createErrorEmbed(
            'Failed to Lock Channel',
            'An error occurred while trying to lock the channel. Please check my permissions.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle locking all channels
 */
async function handleLockAll(interaction, executor, guild) {
    const reason = interaction.options.getString('reason');

    // Check permissions - need real manage_channels
    const permissionCheck = await hasPermission(executor, 'manage_channels');

    if (!permissionCheck.hasPermission) {
        const errorEmbed = createErrorEmbed(
            'Insufficient Permissions',
            permissionCheck.reason || 'You need Manage Channels permission to lock all channels.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    await interaction.deferReply();

    try {
        // Get jail channel IDs to exclude them
        const jailChannels = await getJailChannels(guild.id, guild);
        
        const textChannels = guild.channels.cache.filter(channel => 
            (channel.type === ChannelType.GuildText || 
            channel.type === ChannelType.GuildAnnouncement ||
            channel.type === ChannelType.GuildForum) &&
            channel.id !== jailChannels.jailChannelId && // Skip jail channel by ID
            channel.id !== jailChannels.logChannelId // Skip jail log channel by ID
        );

        let lockedCount = 0;
        let failedChannels = [];

        for (const [channelId, channel] of textChannels) {
            try {
                const isLocked = await LockedChannel.isChannelLocked(guild.id, channelId);
                if (isLocked) continue;

                const originalPermissions = [];
                const everyoneRole = guild.roles.everyone;
                const currentPerms = channel.permissionOverwrites.cache.get(everyoneRole.id);
                
                if (currentPerms) {
                    originalPermissions.push({
                        roleId: everyoneRole.id,
                        allowed: currentPerms.allow.bitfield.toString(),
                        denied: currentPerms.deny.bitfield.toString()
                    });
                }

                await channel.permissionOverwrites.edit(everyoneRole, {
                    SendMessages: false,
                    SendMessagesInThreads: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false
                });

                // Store in database
                await LockedChannel.lockChannel({
                    guildId: guild.id,
                    channelId: channelId,
                    executorId: executor.user.id,
                    reason: reason,
                    lockType: 'mass',
                    originalPermissions: originalPermissions
                });

                lockedCount++;
            } catch (error) {
                console.error(`Failed to lock channel ${channel.name}:`, error);
                failedChannels.push(channel.name);
            }
        }

        // Create moderation case
        let caseId;
        try {
            const caseData = {
                guildId: guild.id,
                type: 'lockdown_all',
                target: { id: guild.id, tag: guild.name },
                executor: { id: executor.user.id, tag: executor.user.tag },
                reason: reason,
                additionalInfo: { lockedChannels: lockedCount }
            };
            caseId = await createModerationCase(caseData);
        } catch (error) {
            console.error('Error creating moderation case:', error);
            caseId = Date.now();
        }

        const successEmbed = await createEmbed(guild.id, {
            title: 'Server Lockdown Initiated',
            description: `Successfully locked down ${lockedCount} channels.`,
            fields: [
                {
                    name: 'Channels Locked',
                    value: lockedCount.toString(),
                    inline: true
                },
                {
                    name: 'Locked By',
                    value: `${executor.user} (${executor.user.tag})`,
                    inline: true
                },
                {
                    name: 'Case ID',
                    value: `#${caseId}`,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: reason,
                    inline: false
                }
            ],
            color: 0xFF4500, // Red-orange for server lockdown
            timestamp: new Date()
        });

        if (failedChannels.length > 0) {
            successEmbed.addFields({
                name: 'Failed Channels',
                value: failedChannels.slice(0, 10).join(', ') + (failedChannels.length > 10 ? '...' : ''),
                inline: false
            });
        }

        await interaction.editReply({ embeds: [successEmbed] });

        // Log the action
        await logLockdownAction(guild, {
            type: 'Server Lockdown',
            executor: executor.user,
            reason: reason,
            caseId: caseId,
            channelsLocked: lockedCount,
            failedChannels: failedChannels
        });

    } catch (error) {
        console.error('Error locking all channels:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to Lock All Channels',
            'An error occurred while trying to lock all channels.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * Handle adding lockdown role
 */
async function handleAddLockdownRole(interaction, executor, guild) {
    const targetRole = interaction.options.getRole('role');

    // Check permissions - need real or fake manage_guild
    const permissionCheck = await hasPermission(executor, 'manage_guild');

    if (!permissionCheck.hasPermission) {
        const errorEmbed = createErrorEmbed(
            'Insufficient Permissions',
            permissionCheck.reason || 'You need Manage Guild permission to manage lockdown roles.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
        await LockdownConfig.addLockdownRole(guild.id, targetRole.id);

        const successEmbed = await createEmbed(guild.id, {
            title: 'Lockdown Role Added',
            description: `${targetRole} can now lock channels without Manage Channels permission.`,
            color: 0x00FF00
        });

        await interaction.reply({ embeds: [successEmbed] });
    } catch (error) {
        console.error('Error adding lockdown role:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to Add Lockdown Role',
            'An error occurred while adding the lockdown role.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle removing lockdown role
 */
async function handleRemoveLockdownRole(interaction, executor, guild) {
    const targetRole = interaction.options.getRole('role');

    // Check permissions - need real or fake manage_guild
    const permissionCheck = await hasPermission(executor, 'manage_guild');

    if (!permissionCheck.hasPermission) {
        const errorEmbed = createErrorEmbed(
            'Insufficient Permissions',
            permissionCheck.reason || 'You need Manage Guild permission to manage lockdown roles.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
        await LockdownConfig.removeLockdownRole(guild.id, targetRole.id);

        const successEmbed = await createEmbed(guild.id, {
            title: 'Lockdown Role Removed',
            description: `${targetRole} can no longer lock channels without Manage Channels permission.`,
            color: 0xFF0000
        });

        await interaction.reply({ embeds: [successEmbed] });
    } catch (error) {
        console.error('Error removing lockdown role:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to Remove Lockdown Role',
            'An error occurred while removing the lockdown role.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle listing lockdown roles
 */
async function handleListLockdownRoles(interaction, executor, guild) {
    // Check permissions - need real or fake manage_guild
    const permissionCheck = await hasPermission(executor, 'manage_guild');

    if (!permissionCheck.hasPermission) {
        const errorEmbed = createErrorEmbed(
            'Insufficient Permissions',
            permissionCheck.reason || 'You need Manage Guild permission to view lockdown roles.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
        const config = await LockdownConfig.getOrCreateConfig(guild.id);
        
        if (config.lockdownRoles.length === 0) {
            const embed = await createEmbed(guild.id, {
                title: 'Lockdown Roles',
                description: 'No roles have lockdown permissions.',
                color: 0x808080
            });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const roleList = config.lockdownRoles.map(roleId => {
            const role = guild.roles.cache.get(roleId);
            return role ? role.toString() : `<@&${roleId}> (Deleted Role)`;
        }).join('\n');

        const embed = await createEmbed(guild.id, {
            title: `Lockdown Roles (${config.lockdownRoles.length})`,
            description: `These roles can lock channels without Manage Channels permission:\n\n${roleList}`,
            color: 0x0099FF
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error listing lockdown roles:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to List Lockdown Roles',
            'An error occurred while retrieving lockdown roles.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle adding ignored channel
 */
async function handleAddIgnoredChannel(interaction, executor, guild) {
    const targetChannel = interaction.options.getChannel('channel');

    // Check permissions - need real or fake manage_guild
    const permissionCheck = await hasPermission(executor, 'manage_guild');

    if (!permissionCheck.hasPermission) {
        const errorEmbed = createErrorEmbed(
            'Insufficient Permissions',
            permissionCheck.reason || 'You need Manage Guild permission to manage ignored channels.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
        await LockdownConfig.addIgnoredChannel(guild.id, targetChannel.id);

        const successEmbed = await createEmbed(guild.id, {
            title: 'Ignored Channel Added',
            description: `${targetChannel} will be ignored during "unlock all" operations.`,
            color: 0x00FF00
        });

        await interaction.reply({ embeds: [successEmbed] });
    } catch (error) {
        console.error('Error adding ignored channel:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to Add Ignored Channel',
            'An error occurred while adding the ignored channel.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle removing ignored channel
 */
async function handleRemoveIgnoredChannel(interaction, executor, guild) {
    const targetChannel = interaction.options.getChannel('channel');

    // Check permissions - need real or fake manage_guild
    const permissionCheck = await hasPermission(executor, 'manage_guild');

    if (!permissionCheck.hasPermission) {
        const errorEmbed = createErrorEmbed(
            'Insufficient Permissions',
            permissionCheck.reason || 'You need Manage Guild permission to manage ignored channels.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
        await LockdownConfig.removeIgnoredChannel(guild.id, targetChannel.id);

        const successEmbed = await createEmbed(guild.id, {
            title: 'Ignored Channel Removed',
            description: `${targetChannel} will no longer be ignored during "unlock all" operations.`,
            color: 0xFF0000
        });

        await interaction.reply({ embeds: [successEmbed] });
    } catch (error) {
        console.error('Error removing ignored channel:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to Remove Ignored Channel',
            'An error occurred while removing the ignored channel.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle listing ignored channels
 */
async function handleListIgnoredChannels(interaction, executor, guild) {
    // Check permissions - need real or fake manage_guild
    const permissionCheck = await hasPermission(executor, 'manage_guild');

    if (!permissionCheck.hasPermission) {
        const errorEmbed = createErrorEmbed(
            'Insufficient Permissions',
            permissionCheck.reason || 'You need Manage Guild permission to view ignored channels.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
        const config = await LockdownConfig.getOrCreateConfig(guild.id);
        
        if (config.ignoredChannels.length === 0) {
            const embed = await createEmbed(guild.id, {
                title: 'Ignored Channels',
                description: 'No channels are ignored during unlock all operations.',
                color: 0x808080
            });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const channelList = config.ignoredChannels.map(channelId => {
            const channel = guild.channels.cache.get(channelId);
            return channel ? channel.toString() : `<#${channelId}> (Deleted Channel)`;
        }).join('\n');

        const embed = await createEmbed(guild.id, {
            title: `Ignored Channels (${config.ignoredChannels.length})`,
            description: `These channels are ignored during "unlock all" operations:\n\n${channelList}`,
            color: 0x0099FF
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error listing ignored channels:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to List Ignored Channels',
            'An error occurred while retrieving ignored channels.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle unlocking mass locked channels only
 */
async function handleUnlockMass(interaction, executor, guild) {
    const reason = interaction.options.getString('reason');

    // Check permissions - need real or fake manage_channels
    const permissionCheck = await hasPermission(executor, 'manage_channels');

    if (!permissionCheck.hasPermission) {
        const errorEmbed = createErrorEmbed(
            'Insufficient Permissions',
            permissionCheck.reason || 'You need Manage Channels permission to unlock channels.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    await interaction.deferReply();

    try {
        // Get jail channel IDs for safety checks
        const jailChannels = await getJailChannels(guild.id, guild);
        
        // Get only mass locked channels
        const massLockedChannels = await LockedChannel.getMassLockedChannels(guild.id);
        
        if (massLockedChannels.length === 0) {
            const errorEmbed = createErrorEmbed(
                'No Mass Locked Channels',
                'There are no channels locked via "lockdown all" to unlock.'
            );
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        let unlockedCount = 0;
        let failedChannels = [];

        for (const lockedChannelData of massLockedChannels) {
            try {
                const channel = guild.channels.cache.get(lockedChannelData.channelId);
                if (!channel) {
                    // Channel doesn't exist anymore, remove from database
                    await LockedChannel.unlockChannel(guild.id, lockedChannelData.channelId);
                    continue;
                }

                // Skip jail-related channels as additional safety
                if (channel.id === jailChannels.jailChannelId || channel.id === jailChannels.logChannelId) {
                    console.log(`Skipping jail-related channel: ${channel.name}`);
                    continue;
                }

                const everyoneRole = guild.roles.everyone;

                // Restore original permissions or clear the overrides
                if (lockedChannelData.originalPermissions.length > 0) {
                    for (const permData of lockedChannelData.originalPermissions) {
                        if (permData.roleId === everyoneRole.id) {
                            await channel.permissionOverwrites.edit(everyoneRole, {
                                SendMessages: null,
                                SendMessagesInThreads: null,
                                CreatePublicThreads: null,
                                CreatePrivateThreads: null
                            });
                        }
                    }
                } else {
                    await channel.permissionOverwrites.edit(everyoneRole, {
                        SendMessages: null,
                        SendMessagesInThreads: null,
                        CreatePublicThreads: null,
                        CreatePrivateThreads: null
                    });
                }

                // Remove from database
                await LockedChannel.unlockChannel(guild.id, lockedChannelData.channelId);
                unlockedCount++;

            } catch (error) {
                console.error(`Failed to unlock channel ${lockedChannelData.channelId}:`, error);
                const channel = guild.channels.cache.get(lockedChannelData.channelId);
                failedChannels.push(channel ? channel.name : lockedChannelData.channelId);
            }
        }

        // Create moderation case
        let caseId;
        try {
            const caseData = {
                guildId: guild.id,
                type: 'unlock_mass',
                target: { id: guild.id, tag: guild.name },
                executor: { id: executor.user.id, tag: executor.user.tag },
                reason: reason,
                additionalInfo: { 
                    unlockedChannels: unlockedCount
                }
            };
            caseId = await createModerationCase(caseData);
        } catch (error) {
            console.error('Error creating moderation case:', error);
            caseId = Date.now();
        }

        const successEmbed = await createEmbed(guild.id, {
            title: 'Mass Unlock Completed',
            description: `Successfully unlocked ${unlockedCount} mass-locked channels.`,
            fields: [
                {
                    name: 'Channels Unlocked',
                    value: unlockedCount.toString(),
                    inline: true
                },
                {
                    name: 'Case ID',
                    value: `#${caseId}`,
                    inline: true
                },
                {
                    name: 'Unlocked By',
                    value: `${executor.user} (${executor.user.tag})`,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: reason,
                    inline: false
                }
            ],
            color: 0x00FF00, // Green for unlock
            timestamp: new Date()
        });

        if (failedChannels.length > 0) {
            successEmbed.addFields({
                name: 'Failed Channels',
                value: failedChannels.slice(0, 10).join(', ') + (failedChannels.length > 10 ? '...' : ''),
                inline: false
            });
        }

        await interaction.editReply({ embeds: [successEmbed] });

        // Log the action using the lockdown log function but with unlock styling
        await logLockdownAction(guild, {
            type: 'Mass Unlock (Mass Locked Only)',
            executor: executor.user,
            reason: reason,
            caseId: caseId,
            channelsLocked: unlockedCount, // Using channelsLocked field for compatibility
            failedChannels: failedChannels
        });

    } catch (error) {
        console.error('Error unlocking mass channels:', error);
        const errorEmbed = createErrorEmbed(
            'Failed to Unlock Mass Channels',
            'An error occurred while trying to unlock mass locked channels.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * Log lockdown action to the configured log channel
 */
async function logLockdownAction(guild, logData) {
    try {
        const logChannelId = await getLogChannel(guild.id, guild);
        if (!logChannelId) {
            console.log('Log channel not configured, skipping lockdown log');
            return;
        }
        
        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) {
            console.log('Log channel not found, skipping lockdown log');
            return;
        }
        
        const isUnlockAction = logData.type.includes('Unlock');
        const icon = isUnlockAction ? '🔓' : '🔒';
        const color = isUnlockAction ? 0x00FF00 : 0xFFA500;
        
        let description;
        if (logData.type === 'Channel Lockdown') {
            description = `${logData.channel} has been locked down.`;
        } else if (logData.type.includes('Unlock')) {
            description = `${logData.channelsLocked} channels have been unlocked.`;
        } else {
            description = `${logData.channelsLocked} channels have been locked down.`;
        }
        
        const logEmbed = await createEmbed(guild.id, {
            title: `${icon} ${logData.type}`,
            description: description,
            fields: [
                {
                    name: 'Moderator',
                    value: `${logData.executor} (${logData.executor.tag})`,
                    inline: true
                },
                {
                    name: 'Case ID',
                    value: `#${logData.caseId}`,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: logData.reason,
                    inline: false
                }
            ],
            footer: {
                text: logData.type === 'Channel Lockdown' 
                    ? `Channel ID: ${logData.channel.id} • Moderator ID: ${logData.executor.id}`
                    : `Moderator ID: ${logData.executor.id}`
            },
            timestamp: new Date(),
            color: color
        });

        if (logData.type === 'Server Lockdown') {
            logEmbed.addFields({
                name: 'Channels Locked',
                value: logData.channelsLocked.toString(),
                inline: true
            });

            if (logData.failedChannels && logData.failedChannels.length > 0) {
                logEmbed.addFields({
                    name: 'Failed Channels',
                    value: logData.failedChannels.slice(0, 5).join(', ') + 
                           (logData.failedChannels.length > 5 ? '...' : ''),
                    inline: true
                });
            }
        }
        
        await logChannel.send({ embeds: [logEmbed] });
        
    } catch (error) {
        console.error('Error logging lockdown action:', error);
    }
}
