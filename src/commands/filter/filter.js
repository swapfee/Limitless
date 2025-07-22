const { SlashCommandBuilder, PermissionFlagsBits, AutoModerationRuleTriggerType, AutoModerationRuleEventType, AutoModerationActionType } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { hasPermission } = require('../../utils/permissionUtils');
const FilterConfig = require('../../models/FilterConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription('Manage server filters and AutoMod rules')
        .addSubcommandGroup(group =>
            group
                .setName('automod')
                .setDescription('Manage Discord AutoMod rules')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('create')
                        .setDescription('Create a new AutoMod rule for custom words')
                        .addStringOption(option =>
                            option.setName('name')
                                .setDescription('Name for the AutoMod rule')
                                .setRequired(true)
                                .setMaxLength(100))
                        .addStringOption(option =>
                            option.setName('words')
                                .setDescription('Comma-separated list of words to filter')
                                .setRequired(true)
                                .setMaxLength(1000))
                        .addStringOption(option =>
                            option.setName('action')
                                .setDescription('Action to take when rule is triggered')
                                .setRequired(false)
                                .addChoices(
                                    { name: 'Block Message', value: 'block' },
                                    { name: 'Block + Send Alert', value: 'alert' },
                                    { name: 'Block + Timeout', value: 'timeout' }
                                )))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List all AutoMod rules'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('delete')
                        .setDescription('Delete an AutoMod rule')
                        .addStringOption(option =>
                            option.setName('rule_id')
                                .setDescription('ID of the AutoMod rule to delete')
                                .setRequired(true))))
        .addSubcommandGroup(group =>
            group
                .setName('module')
                .setDescription('Manage filter modules')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('enable')
                        .setDescription('Enable a filter module')
                        .addStringOption(option =>
                            option.setName('type')
                                .setDescription('Type of filter to enable')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'CAPS (Excessive Capitals)', value: 'caps' },
                                    { name: 'SPAM (Repeated Messages)', value: 'spam' },
                                    { name: 'SPOILERS (Spoiler Tags)', value: 'spoilers' },
                                    { name: 'REGEX (Custom Patterns)', value: 'regex' },
                                    { name: 'SNIPE (Deleted Messages)', value: 'snipe' },
                                    { name: 'MASS MENTION (Multiple @mentions)', value: 'massmention' },
                                    { name: 'MUSIC FILES (Audio Files)', value: 'musicfiles' },
                                    { name: 'EMOJI (Excessive Emojis)', value: 'emoji' },
                                    { name: 'INVITES (Discord Invites)', value: 'invites' },
                                    { name: 'LINKS (URLs)', value: 'links' }
                                )))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('disable')
                        .setDescription('Disable a filter module')
                        .addStringOption(option =>
                            option.setName('type')
                                .setDescription('Type of filter to disable')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'CAPS (Excessive Capitals)', value: 'caps' },
                                    { name: 'SPAM (Repeated Messages)', value: 'spam' },
                                    { name: 'SPOILERS (Spoiler Tags)', value: 'spoilers' },
                                    { name: 'REGEX (Custom Patterns)', value: 'regex' },
                                    { name: 'SNIPE (Deleted Messages)', value: 'snipe' },
                                    { name: 'MASS MENTION (Multiple @mentions)', value: 'massmention' },
                                    { name: 'MUSIC FILES (Audio Files)', value: 'musicfiles' },
                                    { name: 'EMOJI (Excessive Emojis)', value: 'emoji' },
                                    { name: 'INVITES (Discord Invites)', value: 'invites' },
                                    { name: 'LINKS (URLs)', value: 'links' }
                                )))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('config')
                        .setDescription('Configure a filter module')
                        .addStringOption(option =>
                            option.setName('type')
                                .setDescription('Type of filter to configure')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'CAPS (Excessive Capitals)', value: 'caps' },
                                    { name: 'SPAM (Repeated Messages)', value: 'spam' },
                                    { name: 'MASS MENTION (Multiple @mentions)', value: 'massmention' },
                                    { name: 'EMOJI (Excessive Emojis)', value: 'emoji' }
                                ))
                        .addIntegerOption(option =>
                            option.setName('threshold')
                                .setDescription('Threshold for the filter (e.g., max caps percentage, max mentions)')
                                .setRequired(false)
                                .setMinValue(1)
                                .setMaxValue(100))
                        .addStringOption(option =>
                            option.setName('regex_pattern')
                                .setDescription('Regex pattern (only for regex filter)')
                                .setRequired(false)
                                .setMaxLength(500)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('status')
                        .setDescription('View status of all filter modules')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a custom word to the filter')
                .addStringOption(option =>
                    option.setName('word')
                        .setDescription('Word or phrase to add to filter')
                        .setRequired(true)
                        .setMaxLength(100)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a custom word from the filter')
                .addStringOption(option =>
                    option.setName('word')
                        .setDescription('Word or phrase to remove from filter')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all filtered words'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('whitelist')
                .setDescription('Manage filter whitelist')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Add Channel', value: 'add_channel' },
                            { name: 'Remove Channel', value: 'remove_channel' },
                            { name: 'Add Role', value: 'add_role' },
                            { name: 'Remove Role', value: 'remove_role' },
                            { name: 'List All', value: 'list' }
                        ))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel to whitelist/unwhitelist')
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Role to whitelist/unwhitelist')
                        .setRequired(false)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        const subcommandGroup = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;
        const executor = interaction.member;

        try {
            // Server owner bypasses all permission checks
            if (guild.ownerId === executor.user.id) {
                // Server owner can use all commands
            } else {
                // Check permissions based on subcommand type
                let requiredPermission = 'manage_channels'; // Default for most operations
                
                // filter add/remove require manage_guild
                if (subcommandGroup === null && (subcommand === 'add' || subcommand === 'remove')) {
                    requiredPermission = 'manage_guild';
                }
                
                const permissionCheck = await hasPermission(executor, requiredPermission);
                if (!permissionCheck.hasPermission) {
                    const permissionName = requiredPermission === 'manage_guild' ? 'Manage Server' : 'Manage Channels';
                    const errorEmbed = createErrorEmbed(
                        'Insufficient Permissions',
                        permissionCheck.reason || `You need ${permissionName} permission to use this filter command.`
                    );
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            }

            if (subcommandGroup === 'automod') {
                switch (subcommand) {
                    case 'create':
                        await handleAutoModCreate(interaction, guild);
                        break;
                    case 'list':
                        await handleAutoModList(interaction, guild);
                        break;
                    case 'delete':
                        await handleAutoModDelete(interaction, guild);
                        break;
                }
            } else if (subcommandGroup === 'module') {
                switch (subcommand) {
                    case 'enable':
                        await handleModuleEnable(interaction, guild);
                        break;
                    case 'disable':
                        await handleModuleDisable(interaction, guild);
                        break;
                    case 'config':
                        await handleModuleConfig(interaction, guild);
                        break;
                    case 'status':
                        await handleModuleStatus(interaction, guild);
                        break;
                }
            } else {
                switch (subcommand) {
                    case 'add':
                        await handleWordAdd(interaction, guild);
                        break;
                    case 'remove':
                        await handleWordRemove(interaction, guild);
                        break;
                    case 'list':
                        await handleWordList(interaction, guild);
                        break;
                    case 'whitelist':
                        await handleWhitelist(interaction, guild);
                        break;
                }
            }

        } catch (error) {
            console.error('Error in filter command:', error);
            const errorEmbed = createErrorEmbed(
                'Filter System Error',
                'An error occurred while processing the filter command.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
};

/**
 * Handle AutoMod rule creation
 */
async function handleAutoModCreate(interaction, guild) {
    const name = interaction.options.getString('name');
    const words = interaction.options.getString('words');
    const action = interaction.options.getString('action') || 'block';

    const wordList = words.split(',').map(word => word.trim()).filter(word => word.length > 0);

    if (wordList.length === 0) {
        const errorEmbed = createErrorEmbed('Invalid Input', 'Please provide at least one word to filter.');
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
        // Create actions based on user selection
        const actions = [{
            type: AutoModerationActionType.BlockMessage
        }];

        if (action === 'alert' || action === 'timeout') {
            // Find a log channel or use the first available text channel
            const logChannel = guild.channels.cache.find(ch => 
                ch.name.includes('log') || ch.name.includes('mod')
            ) || guild.channels.cache.find(ch => ch.isTextBased());

            if (logChannel) {
                actions.push({
                    type: AutoModerationActionType.SendAlertMessage,
                    metadata: {
                        channelId: logChannel.id
                    }
                });
            }
        }

        if (action === 'timeout') {
            actions.push({
                type: AutoModerationActionType.Timeout,
                metadata: {
                    durationSeconds: 60 // 1 minute timeout
                }
            });
        }

        const rule = await guild.autoModerationRules.create({
            name: name,
            creatorId: interaction.user.id,
            enabled: true,
            eventType: AutoModerationRuleEventType.MessageSend,
            triggerType: AutoModerationRuleTriggerType.Keyword,
            triggerMetadata: {
                keywordFilter: wordList
            },
            actions: actions
        });

        const embed = await createEmbed(guild.id, {
            title: '✅ AutoMod Rule Created',
            description: `Successfully created AutoMod rule **${name}**.`,
            fields: [
                {
                    name: 'Rule ID',
                    value: rule.id,
                    inline: true
                },
                {
                    name: 'Filtered Words',
                    value: wordList.length > 10 ? 
                        `${wordList.slice(0, 10).join(', ')}... (${wordList.length} total)` :
                        wordList.join(', '),
                    inline: false
                },
                {
                    name: 'Action',
                    value: action === 'block' ? 'Block Message' : 
                           action === 'alert' ? 'Block + Send Alert' : 
                           'Block + Send Alert + Timeout',
                    inline: true
                }
            ],
            color: 0x00FF00
        });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error creating AutoMod rule:', error);
        const errorEmbed = createErrorEmbed(
            'AutoMod Creation Failed',
            'Failed to create AutoMod rule. Make sure the bot has Manage Server permissions.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle AutoMod rule listing
 */
async function handleAutoModList(interaction, guild) {
    try {
        const rules = await guild.autoModerationRules.fetch();

        if (rules.size === 0) {
            const embed = await createEmbed(guild.id, {
                title: 'AutoMod Rules',
                description: 'No AutoMod rules have been created yet.',
                color: 0x808080
            });
            return interaction.reply({ embeds: [embed] });
        }

        const ruleFields = [];
        rules.forEach(rule => {
            const actionTypes = rule.actions.map(action => {
                switch (action.type) {
                    case AutoModerationActionType.BlockMessage:
                        return 'Block';
                    case AutoModerationActionType.SendAlertMessage:
                        return 'Alert';
                    case AutoModerationActionType.Timeout:
                        return 'Timeout';
                    default:
                        return 'Unknown';
                }
            }).join(', ');

            ruleFields.push({
                name: `${rule.name} ${rule.enabled ? '🟢' : '🔴'}`,
                value: `**ID:** ${rule.id}\n**Actions:** ${actionTypes}\n**Creator:** <@${rule.creatorId}>`,
                inline: true
            });
        });

        const embed = await createEmbed(guild.id, {
            title: 'AutoMod Rules',
            description: `Found ${rules.size} AutoMod rule${rules.size !== 1 ? 's' : ''}`,
            fields: ruleFields,
            color: 0x0099FF
        });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error fetching AutoMod rules:', error);
        const errorEmbed = createErrorEmbed(
            'AutoMod Fetch Failed',
            'Failed to fetch AutoMod rules.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle AutoMod rule deletion
 */
async function handleAutoModDelete(interaction, guild) {
    const ruleId = interaction.options.getString('rule_id');

    try {
        const rule = await guild.autoModerationRules.fetch(ruleId);
        
        if (!rule) {
            const errorEmbed = createErrorEmbed(
                'Rule Not Found',
                'AutoMod rule with that ID was not found.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        await rule.delete();

        const embed = await createEmbed(guild.id, {
            title: '✅ AutoMod Rule Deleted',
            description: `Successfully deleted AutoMod rule **${rule.name}**.`,
            color: 0xFF0000
        });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error deleting AutoMod rule:', error);
        const errorEmbed = createErrorEmbed(
            'AutoMod Deletion Failed',
            'Failed to delete AutoMod rule. Make sure the rule ID is correct.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle module enable
 */
async function handleModuleEnable(interaction, guild) {
    const filterType = interaction.options.getString('type');

    try {
        const config = await FilterConfig.getOrCreateConfig(guild.id);
        
        if (config.modules[filterType]?.enabled) {
            const errorEmbed = createErrorEmbed(
                'Module Already Enabled',
                `The ${filterType} filter module is already enabled.`
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        await FilterConfig.enableModule(guild.id, filterType);

        const embed = await createEmbed(guild.id, {
            title: '✅ Filter Module Enabled',
            description: `Successfully enabled the **${filterType.toUpperCase()}** filter module.`,
            fields: [
                {
                    name: 'What this does',
                    value: getFilterDescription(filterType),
                    inline: false
                }
            ],
            color: 0x00FF00
        });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error enabling filter module:', error);
        const errorEmbed = createErrorEmbed(
            'Module Enable Failed',
            'Failed to enable the filter module.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle module disable
 */
async function handleModuleDisable(interaction, guild) {
    const filterType = interaction.options.getString('type');

    try {
        const config = await FilterConfig.getOrCreateConfig(guild.id);
        
        if (!config.modules[filterType]?.enabled) {
            const errorEmbed = createErrorEmbed(
                'Module Already Disabled',
                `The ${filterType} filter module is already disabled.`
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        await FilterConfig.disableModule(guild.id, filterType);

        const embed = await createEmbed(guild.id, {
            title: '🔴 Filter Module Disabled',
            description: `Successfully disabled the **${filterType.toUpperCase()}** filter module.`,
            color: 0xFF0000
        });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error disabling filter module:', error);
        const errorEmbed = createErrorEmbed(
            'Module Disable Failed',
            'Failed to disable the filter module.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle module configuration
 */
async function handleModuleConfig(interaction, guild) {
    const filterType = interaction.options.getString('type');
    const threshold = interaction.options.getInteger('threshold');
    const regexPattern = interaction.options.getString('regex_pattern');

    try {
        const config = await FilterConfig.getOrCreateConfig(guild.id);

        if (!config.modules[filterType]?.enabled) {
            const errorEmbed = createErrorEmbed(
                'Module Not Enabled',
                `The ${filterType} filter module must be enabled before configuring it.`
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        const updates = {};
        if (threshold !== null) {
            updates.threshold = threshold;
        }
        if (regexPattern) {
            if (filterType !== 'regex') {
                const errorEmbed = createErrorEmbed(
                    'Invalid Configuration',
                    'Regex patterns can only be set for the regex filter module.'
                );
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            updates.pattern = regexPattern;
        }

        if (Object.keys(updates).length === 0) {
            const errorEmbed = createErrorEmbed(
                'No Configuration Provided',
                'Please provide at least one configuration option.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        await FilterConfig.updateModuleConfig(guild.id, filterType, updates);

        const embed = await createEmbed(guild.id, {
            title: '⚙️ Filter Module Configured',
            description: `Successfully updated configuration for **${filterType.toUpperCase()}** filter module.`,
            fields: Object.entries(updates).map(([key, value]) => ({
                name: key.charAt(0).toUpperCase() + key.slice(1),
                value: String(value),
                inline: true
            })),
            color: 0x0099FF
        });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error configuring filter module:', error);
        const errorEmbed = createErrorEmbed(
            'Module Configuration Failed',
            'Failed to configure the filter module.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle module status
 */
async function handleModuleStatus(interaction, guild) {
    try {
        const config = await FilterConfig.getOrCreateConfig(guild.id);

        const moduleTypes = ['caps', 'spam', 'spoilers', 'regex', 'snipe', 'massmention', 'musicfiles', 'emoji', 'invites', 'links'];
        
        const enabledModules = [];
        const disabledModules = [];

        moduleTypes.forEach(type => {
            const module = config.modules[type];
            if (module?.enabled) {
                let configInfo = '';
                if (module.threshold) configInfo += ` (${module.threshold}%)`;
                if (module.pattern) configInfo += ` (Pattern: ${module.pattern})`;
                enabledModules.push(`🟢 **${type.toUpperCase()}**${configInfo}`);
            } else {
                disabledModules.push(`🔴 **${type.toUpperCase()}**`);
            }
        });

        const embed = await createEmbed(guild.id, {
            title: 'Filter Module Status',
            fields: [
                {
                    name: 'Enabled Modules',
                    value: enabledModules.length > 0 ? enabledModules.join('\n') : 'None',
                    inline: false
                },
                {
                    name: 'Disabled Modules', 
                    value: disabledModules.length > 0 ? disabledModules.join('\n') : 'None',
                    inline: false
                }
            ],
            color: 0x0099FF
        });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error getting module status:', error);
        const errorEmbed = createErrorEmbed(
            'Status Fetch Failed',
            'Failed to fetch filter module status.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle adding custom words
 */
async function handleWordAdd(interaction, guild) {
    const word = interaction.options.getString('word').toLowerCase();

    try {
        const config = await FilterConfig.getOrCreateConfig(guild.id);
        
        if (config.customWords.includes(word)) {
            const errorEmbed = createErrorEmbed(
                'Word Already Filtered',
                'This word is already in the filter list.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        await FilterConfig.addCustomWord(guild.id, word);

        const embed = await createEmbed(guild.id, {
            title: '✅ Word Added to Filter',
            description: `Successfully added "**${word}**" to the custom word filter.`,
            color: 0x00FF00
        });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error adding custom word:', error);
        const errorEmbed = createErrorEmbed(
            'Word Add Failed',
            'Failed to add word to filter.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle removing custom words
 */
async function handleWordRemove(interaction, guild) {
    const word = interaction.options.getString('word').toLowerCase();

    try {
        const config = await FilterConfig.getOrCreateConfig(guild.id);
        
        if (!config.customWords.includes(word)) {
            const errorEmbed = createErrorEmbed(
                'Word Not Found',
                'This word is not in the filter list.'
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        await FilterConfig.removeCustomWord(guild.id, word);

        const embed = await createEmbed(guild.id, {
            title: '✅ Word Removed from Filter',
            description: `Successfully removed "**${word}**" from the custom word filter.`,
            color: 0xFF0000
        });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error removing custom word:', error);
        const errorEmbed = createErrorEmbed(
            'Word Remove Failed',
            'Failed to remove word from filter.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle listing custom words
 */
async function handleWordList(interaction, guild) {
    try {
        const config = await FilterConfig.getOrCreateConfig(guild.id);

        if (config.customWords.length === 0) {
            const embed = await createEmbed(guild.id, {
                title: 'Custom Filtered Words',
                description: 'No custom words have been added to the filter yet.',
                color: 0x808080
            });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const embed = await createEmbed(guild.id, {
            title: 'Custom Filtered Words',
            description: `**Total:** ${config.customWords.length} word${config.customWords.length !== 1 ? 's' : ''}`,
            fields: [
                {
                    name: 'Filtered Words',
                    value: config.customWords.map(word => `• ${word}`).join('\n') || 'None',
                    inline: false
                }
            ],
            color: 0x0099FF
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
        console.error('Error listing custom words:', error);
        const errorEmbed = createErrorEmbed(
            'Word List Failed',
            'Failed to fetch custom word list.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Handle whitelist management
 */
async function handleWhitelist(interaction, guild) {
    const action = interaction.options.getString('action');
    const channel = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');

    try {
        const config = await FilterConfig.getOrCreateConfig(guild.id);

        switch (action) {
            case 'add_channel':
                if (!channel) {
                    const errorEmbed = createErrorEmbed('Missing Parameter', 'Please specify a channel to whitelist.');
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
                await FilterConfig.addWhitelistChannel(guild.id, channel.id);
                break;

            case 'remove_channel':
                if (!channel) {
                    const errorEmbed = createErrorEmbed('Missing Parameter', 'Please specify a channel to remove from whitelist.');
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
                await FilterConfig.removeWhitelistChannel(guild.id, channel.id);
                break;

            case 'add_role':
                if (!role) {
                    const errorEmbed = createErrorEmbed('Missing Parameter', 'Please specify a role to whitelist.');
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
                await FilterConfig.addWhitelistRole(guild.id, role.id);
                break;

            case 'remove_role':
                if (!role) {
                    const errorEmbed = createErrorEmbed('Missing Parameter', 'Please specify a role to remove from whitelist.');
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
                await FilterConfig.removeWhitelistRole(guild.id, role.id);
                break;

            case 'list':
                const updatedConfig = await FilterConfig.getOrCreateConfig(guild.id);
                const whitelistChannels = updatedConfig.whitelistChannels.map(id => `<#${id}>`).join('\n') || 'None';
                const whitelistRoles = updatedConfig.whitelistRoles.map(id => `<@&${id}>`).join('\n') || 'None';

                const listEmbed = await createEmbed(guild.id, {
                    title: 'Filter Whitelist',
                    fields: [
                        {
                            name: 'Whitelisted Channels',
                            value: whitelistChannels,
                            inline: false
                        },
                        {
                            name: 'Whitelisted Roles',
                            value: whitelistRoles,
                            inline: false
                        }
                    ],
                    color: 0x0099FF
                });

                return interaction.reply({ embeds: [listEmbed] });
        }

        const actionText = action.includes('add') ? 'added to' : 'removed from';
        const targetText = action.includes('channel') ? `channel ${channel}` : `role ${role}`;

        const embed = await createEmbed(guild.id, {
            title: '✅ Whitelist Updated',
            description: `Successfully ${actionText} whitelist: ${targetText}`,
            color: action.includes('add') ? 0x00FF00 : 0xFF0000
        });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error managing whitelist:', error);
        const errorEmbed = createErrorEmbed(
            'Whitelist Management Failed',
            'Failed to update filter whitelist.'
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

/**
 * Get description for filter types
 */
function getFilterDescription(filterType) {
    const descriptions = {
        'caps': 'Filters messages with excessive capital letters',
        'spam': 'Filters repeated messages or rapid message sending',
        'spoilers': 'Filters messages with excessive spoiler tags',
        'regex': 'Filters messages matching custom regex patterns',
        'snipe': 'Prevents snipe bot functionality by deleting tracked messages',
        'massmention': 'Filters messages with excessive @mentions',
        'musicfiles': 'Filters uploaded music/audio files',
        'emoji': 'Filters messages with excessive emojis',
        'invites': 'Filters Discord server invites',
        'links': 'Filters URLs and links'
    };

    return descriptions[filterType] || 'Custom filter module';
}
