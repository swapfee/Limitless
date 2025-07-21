const { SlashCommandBuilder, PermissionFlagsBits, InteractionResponseFlags } = require('discord.js');
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { canConfigureAntiNuke, getAntiNukeLogChannel } = require('../../utils/permissionUtils');
const AntiNukeConfig = require('../../models/AntiNukeConfig');
const AntiNukeCounter = require('../../models/AntiNukeRateLimit');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antinuke')
        .setDescription('AntiNuke system configuration and management')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable or disable the antinuke system')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Enable (true) or disable (false) antinuke')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current antinuke configuration'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset user action counters')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to reset counters for')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Specific action to reset (leave empty for all)')
                        .addChoices(
                            { name: 'Channel Delete', value: 'channelDelete' },
                            { name: 'Channel Create', value: 'channelCreate' },
                            { name: 'Role Delete', value: 'roleDelete' },
                            { name: 'Role Create', value: 'roleCreate' },
                            { name: 'Role Update', value: 'roleUpdate' },
                            { name: 'Member Kick', value: 'memberKick' },
                            { name: 'Member Ban', value: 'memberBan' },
                            { name: 'Webhook Create', value: 'webhookCreate' },
                            { name: 'Emoji Delete', value: 'emojiDelete' },
                            { name: 'Guild Update', value: 'guildUpdate' }
                        )))
        .addSubcommandGroup(group =>
            group
                .setName('punishment')
                .setDescription('Configure punishment settings')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('set')
                        .setDescription('Set punishment type for violations')
                        .addStringOption(option =>
                            option.setName('type')
                                .setDescription('Type of punishment to apply')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'None', value: 'none' },
                                    { name: 'Kick', value: 'kick' },
                                    { name: 'Ban', value: 'ban' },
                                    { name: 'Strip Permissions', value: 'strip_permissions' },
                                    { name: 'Jail + Strip Permissions', value: 'jail_and_strip' }
                                ))
                        .addIntegerOption(option =>
                            option.setName('jail_duration')
                                .setDescription('Jail duration in minutes (only for jail punishments)')
                                .setMinValue(1)
                                .setMaxValue(43200))))
        .addSubcommandGroup(group =>
            group
                .setName('limits')
                .setDescription('Configure action limits')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('set')
                        .setDescription('Set action limits')
                        .addStringOption(option =>
                            option.setName('action')
                                .setDescription('Action type to configure')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Channel Delete', value: 'channelDelete' },
                                    { name: 'Channel Create', value: 'channelCreate' },
                                    { name: 'Role Delete', value: 'roleDelete' },
                                    { name: 'Role Create', value: 'roleCreate' },
                                    { name: 'Role Update', value: 'roleUpdate' },
                                    { name: 'Member Kick', value: 'memberKick' },
                                    { name: 'Member Ban', value: 'memberBan' },
                                    { name: 'Webhook Create', value: 'webhookCreate' },
                                    { name: 'Emoji Delete', value: 'emojiDelete' },
                                    { name: 'Guild Update', value: 'guildUpdate' }
                                ))
                        .addBooleanOption(option =>
                            option.setName('enabled')
                                .setDescription('Enable or disable this action limit'))
                        .addIntegerOption(option =>
                            option.setName('limit')
                                .setDescription('Maximum allowed actions before punishment')
                                .setMinValue(1)
                                .setMaxValue(100))))
        .addSubcommandGroup(group =>
            group
                .setName('logging')
                .setDescription('Configure logging settings')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('enable')
                        .setDescription('Enable or disable logging')
                        .addBooleanOption(option =>
                            option.setName('enabled')
                                .setDescription('Enable or disable antinuke logging')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('actions')
                        .setDescription('Configure action logging')
                        .addBooleanOption(option =>
                            option.setName('enabled')
                                .setDescription('Log all monitored actions')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('punishments')
                        .setDescription('Configure punishment logging')
                        .addBooleanOption(option =>
                            option.setName('enabled')
                                .setDescription('Log punishments applied')
                                .setRequired(true))))
        .addSubcommandGroup(group =>
            group
                .setName('whitelist')
                .setDescription('Manage antinuke whitelist')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Add user to whitelist')
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('User to add to whitelist')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove user from whitelist')
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('User to remove from whitelist')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List all whitelisted users'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('clear')
                        .setDescription('Clear all whitelisted users'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('settings')
                        .setDescription('Configure whitelist settings')
                        .addBooleanOption(option =>
                            option.setName('bypass_owner')
                                .setDescription('Allow server owner to bypass antinuke'))
                        .addBooleanOption(option =>
                            option.setName('bypass_bots')
                                .setDescription('Allow bots to bypass antinuke'))))
        .addSubcommandGroup(group =>
            group
                .setName('admin')
                .setDescription('Manage antinuke administrators')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Add antinuke administrator')
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('User to make antinuke admin')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove antinuke administrator')
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('User to remove as antinuke admin')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List all antinuke administrators'))),
    
    async execute(interaction) {
        const subcommandGroup = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();
        const executor = interaction.member;
        const guild = interaction.guild;

        // Check if user can configure antinuke
        const permissionCheck = await canConfigureAntiNuke(executor, guild.id);
        if (!permissionCheck.canConfigure) {
            const errorEmbed = createErrorEmbed(
                'Insufficient Permissions',
                permissionCheck.reason
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        try {
            // Defer reply early to prevent timeout
            await interaction.deferReply();

            if (subcommandGroup === 'punishment') {
                if (subcommand === 'set') {
                    await handlePunishmentSet(interaction, executor, guild);
                }
            } else if (subcommandGroup === 'limits') {
                if (subcommand === 'set') {
                    await handleLimitsSet(interaction, executor, guild);
                }
            } else if (subcommandGroup === 'logging') {
                switch (subcommand) {
                    case 'enable':
                        await handleLoggingEnable(interaction, executor, guild);
                        break;
                    case 'actions':
                        await handleLoggingActions(interaction, executor, guild);
                        break;
                    case 'punishments':
                        await handleLoggingPunishments(interaction, executor, guild);
                        break;
                }
            } else if (subcommandGroup === 'whitelist') {
                switch (subcommand) {
                    case 'add':
                        await handleWhitelistAdd(interaction, executor, guild);
                        break;
                    case 'remove':
                        await handleWhitelistRemove(interaction, executor, guild);
                        break;
                    case 'list':
                        await handleWhitelistList(interaction, executor, guild);
                        break;
                    case 'clear':
                        await handleWhitelistClear(interaction, executor, guild);
                        break;
                    case 'settings':
                        await handleWhitelistSettings(interaction, executor, guild);
                        break;
                }
            } else if (subcommandGroup === 'admin') {
                switch (subcommand) {
                    case 'add':
                        await handleAdminAdd(interaction, executor, guild);
                        break;
                    case 'remove':
                        await handleAdminRemove(interaction, executor, guild);
                        break;
                    case 'list':
                        await handleAdminList(interaction, executor, guild);
                        break;
                }
            } else {
                switch (subcommand) {
                    case 'enable':
                        await handleEnable(interaction, executor, guild);
                        break;
                    case 'status':
                        await handleStatus(interaction, executor, guild);
                        break;
                    case 'reset':
                        await handleReset(interaction, executor, guild);
                        break;
                }
            }
        } catch (error) {
            console.error('Error in antinuke command:', error);
            const errorEmbed = createErrorEmbed(
                'AntiNuke System Error',
                'An error occurred while processing the antinuke command.'
            );
            
            if (interaction.deferred) {
                return interaction.editReply({ embeds: [errorEmbed] });
            } else if (!interaction.replied) {
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },
};

// Handler functions
async function handleEnable(interaction, executor, guild) {
    const enabled = interaction.options.getBoolean('enabled');
    
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        config.enabled = enabled;
        await config.save();
        
        const statusText = enabled ? 'enabled' : 'disabled';
        
        const embed = await createEmbed(guild.id, {
            title: 'AntiNuke System Updated',
            description: `AntiNuke protection has been **${statusText}** for this server.`,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error enabling/disabling antinuke:', error);
        const errorEmbed = createErrorEmbed(
            'Configuration Error',
            'Failed to update antinuke status. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handlePunishmentSet(interaction, executor, guild) {
    const punishmentType = interaction.options.getString('type');
    const jailDuration = interaction.options.getInteger('jail_duration');
    
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        config.punishment.type = punishmentType;
        
        // Set jail duration if provided and punishment involves jail
        if (jailDuration && punishmentType === 'jail_and_strip') {
            config.punishment.jailDuration = jailDuration * 60; // Convert minutes to seconds
        }
        
        await config.save();
        
        let description = `Punishment type set to **${getPunishmentDisplayName(punishmentType)}**.`;
        if (jailDuration && punishmentType === 'jail_and_strip') {
            description += `\nJail duration set to **${jailDuration} minutes**.`;
        }
        
        const embed = await createEmbed(guild.id, {
            title: 'Punishment Configuration Updated',
            description: description,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error configuring punishment:', error);
        const errorEmbed = createErrorEmbed(
            'Configuration Error',
            'Failed to update punishment settings. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleLimitsSet(interaction, executor, guild) {
    const actionType = interaction.options.getString('action');
    const enabled = interaction.options.getBoolean('enabled');
    const limit = interaction.options.getInteger('limit');
    
    if (enabled === null && limit === null) {
        const errorEmbed = createErrorEmbed(
            'Invalid Configuration',
            'You must specify at least one setting to update (enabled or limit).'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
    
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        await config.updateLimit(actionType, enabled, limit);
        
        const currentLimit = config.getLimit(actionType);
        const actionDisplayName = getActionDisplayName(actionType);
        
        let description = `**${actionDisplayName}** limit updated:\n`;
        description += `• Status: ${currentLimit.enabled ? 'Enabled' : 'Disabled'}\n`;
        description += `• Max Actions: **${currentLimit.max}**`;
        
        const embed = await createEmbed(guild.id, {
            title: 'Action Limit Updated',
            description: description,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error configuring limits:', error);
        const errorEmbed = createErrorEmbed(
            'Configuration Error',
            'Failed to update action limits. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleLoggingEnable(interaction, executor, guild) {
    const enabled = interaction.options.getBoolean('enabled');
    
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        config.logging.enabled = enabled;
        await config.save();
        
        const embed = await createEmbed(guild.id, {
            title: 'Logging Configuration Updated',
            description: `Antinuke logging has been **${enabled ? 'enabled' : 'disabled'}**.`,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error configuring logging:', error);
        const errorEmbed = createErrorEmbed(
            'Configuration Error',
            'Failed to update logging settings. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleLoggingActions(interaction, executor, guild) {
    const enabled = interaction.options.getBoolean('enabled');
    
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        config.logging.logActions = enabled;
        await config.save();
        
        const embed = await createEmbed(guild.id, {
            title: 'Action Logging Updated',
            description: `Action logging has been **${enabled ? 'enabled' : 'disabled'}**.`,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error configuring action logging:', error);
        const errorEmbed = createErrorEmbed(
            'Configuration Error',
            'Failed to update action logging. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleLoggingPunishments(interaction, executor, guild) {
    const enabled = interaction.options.getBoolean('enabled');
    
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        config.logging.logPunishments = enabled;
        await config.save();
        
        const embed = await createEmbed(guild.id, {
            title: 'Punishment Logging Updated',
            description: `Punishment logging has been **${enabled ? 'enabled' : 'disabled'}**.`,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error configuring punishment logging:', error);
        const errorEmbed = createErrorEmbed(
            'Configuration Error',
            'Failed to update punishment logging. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleWhitelistAdd(interaction, executor, guild) {
    const targetUser = interaction.options.getUser('user');
    
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        await config.addUserWhitelist(targetUser.id);
        
        const embed = await createEmbed(guild.id, {
            title: 'User Whitelisted',
            description: `${targetUser} (${targetUser.tag}) has been added to the antinuke whitelist.`,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error adding to whitelist:', error);
        const errorEmbed = createErrorEmbed(
            'Whitelist Error',
            'Failed to add user to whitelist. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleWhitelistRemove(interaction, executor, guild) {
    const targetUser = interaction.options.getUser('user');
    
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        await config.removeUserWhitelist(targetUser.id);
        
        const embed = await createEmbed(guild.id, {
            title: 'User Removed from Whitelist',
            description: `${targetUser} (${targetUser.tag}) has been removed from the antinuke whitelist.`,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error removing from whitelist:', error);
        const errorEmbed = createErrorEmbed(
            'Whitelist Error',
            'Failed to remove user from whitelist. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleWhitelistList(interaction, executor, guild) {
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        
        if (config.whitelist.users.length === 0) {
            const embed = await createEmbed(guild.id, {
                title: 'AntiNuke Whitelist',
                description: 'No users are currently whitelisted.',
                color: 0x808080
            });
            return interaction.editReply({ embeds: [embed] });
        }
        
        const userList = config.whitelist.users.map(userId => {
            return `<@${userId}> (\`${userId}\`)`;
        }).join('\n');
        
        const embed = await createEmbed(guild.id, {
            title: `AntiNuke Whitelist (${config.whitelist.users.length})`,
            description: userList
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error listing whitelist:', error);
        const errorEmbed = createErrorEmbed(
            'Whitelist Error',
            'Failed to retrieve whitelist. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleWhitelistClear(interaction, executor, guild) {
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        const clearedCount = config.whitelist.users.length;
        
        config.whitelist.users = [];
        await config.save();
        
        const embed = await createEmbed(guild.id, {
            title: 'Whitelist Cleared',
            description: `Cleared **${clearedCount}** users from the antinuke whitelist.`,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error clearing whitelist:', error);
        const errorEmbed = createErrorEmbed(
            'Whitelist Error',
            'Failed to clear whitelist. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleWhitelistSettings(interaction, executor, guild) {
    const bypassOwner = interaction.options.getBoolean('bypass_owner');
    const bypassBots = interaction.options.getBoolean('bypass_bots');
    
    if (bypassOwner === null && bypassBots === null) {
        const errorEmbed = createErrorEmbed(
            'Invalid Configuration',
            'You must specify at least one whitelist setting to update.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
    
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        
        if (bypassOwner !== null) {
            config.whitelist.bypassOwner = bypassOwner;
        }
        if (bypassBots !== null) {
            config.whitelist.bypassBots = bypassBots;
        }
        
        await config.save();
        
        let description = 'Whitelist settings updated:\n';
        description += `• Owner Bypass: ${config.whitelist.bypassOwner ? 'Yes' : 'No'}\n`;
        description += `• Bot Bypass: ${config.whitelist.bypassBots ? 'Yes' : 'No'}`;
        
        const embed = await createEmbed(guild.id, {
            title: 'Whitelist Settings Updated',
            description: description,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error updating whitelist settings:', error);
        const errorEmbed = createErrorEmbed(
            'Configuration Error',
            'Failed to update whitelist settings. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleAdminAdd(interaction, executor, guild) {
    const targetUser = interaction.options.getUser('user');
    
    // Only server owner can add antinuke admins
    if (guild.ownerId !== executor.user.id) {
        const errorEmbed = createErrorEmbed(
            'Insufficient Permissions',
            'Only the server owner can add antinuke administrators.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
    
    // Prevent adding the server owner as an admin (redundant)
    if (targetUser.id === guild.ownerId) {
        const errorEmbed = createErrorEmbed(
            'Invalid Target',
            'The server owner already has all antinuke permissions and cannot be added as an admin.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
    
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        
        // Check if user is already an admin
        if (config.isAntiNukeAdmin(targetUser.id)) {
            const errorEmbed = createErrorEmbed(
                'Already Admin',
                `${targetUser.tag} is already an antinuke administrator.`
            );
            return interaction.editReply({ embeds: [errorEmbed] });
        }
        
        await config.addAntiNukeAdmin(targetUser.id);
        
        const embed = await createEmbed(guild.id, {
            title: 'AntiNuke Admin Added',
            description: `${targetUser} (${targetUser.tag}) has been added as an antinuke administrator.`,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error adding antinuke admin:', error);
        const errorEmbed = createErrorEmbed(
            'Admin Error',
            'Failed to add antinuke administrator. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleAdminRemove(interaction, executor, guild) {
    const targetUser = interaction.options.getUser('user');
    
    // Only server owner can remove antinuke admins
    if (guild.ownerId !== executor.user.id) {
        const errorEmbed = createErrorEmbed(
            'Insufficient Permissions',
            'Only the server owner can remove antinuke administrators.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
    
    // Prevent removing the server owner
    if (targetUser.id === guild.ownerId) {
        const errorEmbed = createErrorEmbed(
            'Invalid Target',
            'The server owner cannot be removed as they are not a configurable admin.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
    
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        
        // Check if user is actually an admin
        if (!config.isAntiNukeAdmin(targetUser.id)) {
            const errorEmbed = createErrorEmbed(
                'Not an Admin',
                `${targetUser.tag} is not an antinuke administrator.`
            );
            return interaction.editReply({ embeds: [errorEmbed] });
        }
        
        await config.removeAntiNukeAdmin(targetUser.id);
        
        const embed = await createEmbed(guild.id, {
            title: 'AntiNuke Admin Removed',
            description: `${targetUser} (${targetUser.tag}) has been removed as an antinuke administrator.`,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error removing antinuke admin:', error);
        const errorEmbed = createErrorEmbed(
            'Admin Error',
            'Failed to remove antinuke administrator. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleAdminList(interaction, executor, guild) {
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        
        if (config.adminUsers.length === 0) {
            const embed = await createEmbed(guild.id, {
                title: 'AntiNuke Administrators',
                description: 'No additional antinuke administrators are configured.\n\n**Note:** The server owner always has antinuke admin permissions.',
                color: 0x808080
            });
            return interaction.editReply({ embeds: [embed] });
        }
        
        const adminList = config.adminUsers.map(userId => {
            return `<@${userId}> (\`${userId}\`)`;
        }).join('\n');
        
        const embed = await createEmbed(guild.id, {
            title: `AntiNuke Administrators (${config.adminUsers.length})`,
            description: `${adminList}\n\n**Note:** The server owner always has antinuke admin permissions.`,
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error listing antinuke admins:', error);
        const errorEmbed = createErrorEmbed(
            'Admin Error',
            'Failed to retrieve antinuke administrators. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleReset(interaction, executor, guild) {
    const targetUser = interaction.options.getUser('user');
    const actionType = interaction.options.getString('action');
    
    try {
        const resetCount = await AntiNukeCounter.resetCounter(guild.id, targetUser.id, actionType);
        
        let description;
        if (actionType) {
            description = `Reset **${getActionDisplayName(actionType)}** counter for ${targetUser} (${targetUser.tag}).`;
        } else {
            description = `Reset **all** action counters for ${targetUser} (${targetUser.tag}).`;
        }
        
        const embed = await createEmbed(guild.id, {
            title: 'Counters Reset',
            description: description + `\n\n**Counters affected:** ${resetCount}`,
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error resetting counters:', error);
        const errorEmbed = createErrorEmbed(
            'Reset Error',
            'Failed to reset action counters. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleStatus(interaction, executor, guild) {
    try {
        const config = await AntiNukeConfig.getOrCreateConfig(guild.id);
        
        // Create modules section showing enabled/disabled status with checkmarks
        const moduleStatus = [];
        const limits = config.limits;
        
        // Check which modules are enabled
        moduleStatus.push(`Channel Creation/Deletion: ${limits.channelCreate?.enabled || limits.channelDelete?.enabled ? '✓' : '✗'}`);
        moduleStatus.push(`Role Deletion: ${limits.roleDelete?.enabled ? '✓' : '✗'}`);
        moduleStatus.push(`Emoji Deletion: ${limits.emojiDelete?.enabled ? '✓' : '✗'}`);
        moduleStatus.push(`Mass Member Ban: ${limits.memberBan?.enabled ? '✓' : '✗'}`);
        moduleStatus.push(`Mass Member Kick: ${limits.memberKick?.enabled ? '✓' : '✗'}`);
        moduleStatus.push(`Webhook Creation: ${limits.webhookCreate?.enabled ? '✓' : '✗'}`);
        moduleStatus.push(`Vanity Protection: ${limits.guildUpdate?.enabled ? '✓' : '✗'}`);
        
        // Create general settings section
        const generalSettings = [];
        generalSettings.push(`Super Admins: ${config.adminUsers.length}`);
        generalSettings.push(`Whitelisted Bots: 0`); // This would need to be tracked separately
        generalSettings.push(`Whitelisted Members: ${config.whitelist.users.length}`);
        generalSettings.push(`Protection Modules: ${config.enabled ? '7 enabled' : '7 disabled'}`);
        generalSettings.push(`Watch Permission Grant: ${config.autoPunish ? '6/12 perms' : '0/12 perms'}`);
        generalSettings.push(`Watch Permission Remove: ${config.autoPunish ? '1/12 perms' : '0/12 perms'}`);
        generalSettings.push(`Deny Bot Joins (botadd): ${limits.botAdd?.enabled ? '✗' : '✗'}`);
        
        const statusEmbed = await createEmbed(guild.id, {
            title: 'Settings',
            description: `Antinuke is **${config.enabled ? 'enabled' : 'disabled'}** in this server`,
            fields: [
                {
                    name: 'Modules',
                    value: moduleStatus.join('\n'),
                    inline: true
                },
                {
                    name: 'General',
                    value: generalSettings.join('\n'),
                    inline: true
                },
                {
                    name: 'Punishment Settings',
                    value: `Type: ${getPunishmentDisplayName(config.punishment.type)}\nJail Duration: ${config.punishment.type === 'jail_and_strip' ? (config.punishment.jailDuration ? `${Math.floor(config.punishment.jailDuration / 60)} minutes` : 'Permanent') : 'N/A'}`,
                    inline: true
                },
                {
                    name: 'Logging Configuration',
                    value: `Channel: ${config.logging.channelId ? `<#${config.logging.channelId}>` : 'Not set'}\nLog Actions: ${config.logging.logActions ? 'Yes' : 'No'}\nLog Punishments: ${config.logging.logPunishments ? 'Yes' : 'No'}`,
                    inline: true
                }
            ],
            timestamp: new Date()
        });
        
        await interaction.editReply({ embeds: [statusEmbed] });
    } catch (error) {
        console.error('Error getting antinuke status:', error);
        const errorEmbed = createErrorEmbed(
            'Status Error',
            'Failed to retrieve antinuke status. Please try again.'
        );
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

// Helper functions
function getPunishmentDisplayName(type) {
    const names = {
        'none': 'None',
        'kick': 'Kick',
        'ban': 'Ban',
        'strip_permissions': 'Strip Permissions',
        'jail_and_strip': 'Jail + Strip Permissions'
    };
    return names[type] || type;
}

function getActionDisplayName(actionType) {
    const names = {
        'channelDelete': 'Channel Delete',
        'channelCreate': 'Channel Create',
        'roleDelete': 'Role Delete',
        'roleCreate': 'Role Create',
        'roleUpdate': 'Role Update',
        'memberKick': 'Member Kick',
        'memberBan': 'Member Ban',
        'webhookCreate': 'Webhook Create',
        'emojiDelete': 'Emoji Delete',
        'guildUpdate': 'Guild Update'
    };
    return names[actionType] || actionType;
}

function getActionLimitsDisplay(limits) {
    const limitEntries = [];
    for (const [action, config] of Object.entries(limits)) {
        const status = config.enabled ? 'Enabled' : 'Disabled';
        limitEntries.push(`**${getActionDisplayName(action)}:** ${status} (${config.max})`);
    }
    return limitEntries.join('\n') || 'No limits configured';
}
