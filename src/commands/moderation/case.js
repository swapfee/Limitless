const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const { hasPermission } = require('../../utils/permissionUtils');
const { getModerationCase, getUserModerationHistory, getRecentModerationCases, formatModerationType } = require('../../utils/moderationUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('case')
        .setDescription('Look up moderation cases')
        .addSubcommand(subcommand =>
            subcommand
                .setName('lookup')
                .setDescription('Look up a specific case by ID')
                .addIntegerOption(option =>
                    option
                        .setName('case_id')
                        .setDescription('The case ID to look up')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Look up moderation history for a user')
                .addUserOption(option =>
                    option
                        .setName('target')
                        .setDescription('The user to look up')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('limit')
                        .setDescription('Number of cases to show (default: 10)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(25)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('recent')
                .setDescription('Look up recent moderation cases')
                .addIntegerOption(option =>
                    option
                        .setName('limit')
                        .setDescription('Number of cases to show (default: 10)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(25)
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();
        
        const executor = interaction.member;
        const guild = interaction.guild;
        
        // Check permissions - need either real or fake moderation permissions
        const hasRealPermission = executor.permissions.has(PermissionFlagsBits.ModerateMembers) ||
                                executor.permissions.has(PermissionFlagsBits.BanMembers) ||
                                executor.permissions.has(PermissionFlagsBits.KickMembers);
        
        const hasFakePermission = await hasPermission(executor, 'ban_members') ||
                                 await hasPermission(executor, 'kick_members');

        if (!hasRealPermission && !hasFakePermission.hasPermission) {
            const errorEmbed = createErrorEmbed(
                'Insufficient Permissions',
                'You need moderation permissions to view case information.'
            );
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'lookup') {
                await handleCaseLookup(interaction, guild);
            } else if (subcommand === 'user') {
                await handleUserHistory(interaction, guild);
            } else if (subcommand === 'recent') {
                await handleRecentCases(interaction, guild);
            }
        } catch (error) {
            console.error('Error in case command:', error);
            const errorEmbed = createErrorEmbed(
                'Command Error',
                'An error occurred while processing your request.'
            );
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};

/**
 * Handle case lookup by ID
 * @param {Interaction} interaction - The interaction
 * @param {Guild} guild - The guild
 */
async function handleCaseLookup(interaction, guild) {
    const caseId = interaction.options.getInteger('case_id');
    
    const moderationCase = await getModerationCase(guild.id, caseId);
    
    if (!moderationCase) {
        const errorEmbed = createErrorEmbed(
            'Case Not Found',
            `No case found with ID #${caseId}`
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
    }

    // Try to fetch user objects for better display
    let targetUser, executorUser;
    try {
        targetUser = await interaction.client.users.fetch(moderationCase.targetUserId);
    } catch (error) {
        targetUser = { tag: moderationCase.targetUserTag, id: moderationCase.targetUserId };
    }

    try {
        executorUser = await interaction.client.users.fetch(moderationCase.executorId);
    } catch (error) {
        executorUser = { tag: moderationCase.executorTag, id: moderationCase.executorId };
    }

    const embed = await createEmbed(guild.id, {
        title: `Case #${moderationCase.caseId} - ${formatModerationType(moderationCase.type)}`,
        fields: [
            {
                name: 'Target User',
                value: `${targetUser.tag} (${targetUser.id})`,
                inline: true
            },
            {
                name: 'Moderator',
                value: `${executorUser.tag} (${executorUser.id})`,
                inline: true
            },
            {
                name: 'Action',
                value: formatModerationType(moderationCase.type),
                inline: true
            },
            {
                name: 'Reason',
                value: moderationCase.reason,
                inline: false
            }
        ],
        timestamp: moderationCase.createdAt,
        footer: {
            text: `Case ID: #${moderationCase.caseId}`
        }
    });

    // Add duration field if applicable
    if (moderationCase.duration) {
        embed.data.fields.splice(3, 0, {
            name: 'Duration',
            value: moderationCase.duration,
            inline: true
        });
    }

    // Add expiration field if applicable
    if (moderationCase.expiresAt) {
        embed.data.fields.push({
            name: 'Expires At',
            value: `<t:${Math.floor(moderationCase.expiresAt.getTime() / 1000)}:F>`,
            inline: true
        });
    }

    // Add additional info
    if (moderationCase.additionalInfo) {
        const additionalFields = [];
        
        if (moderationCase.additionalInfo.deleteMessages) {
            additionalFields.push('Messages Deleted');
        }
        if (moderationCase.additionalInfo.dmSent) {
            additionalFields.push('DM Sent');
        }
        if (moderationCase.additionalInfo.automatic) {
            additionalFields.push('Automatic Action');
        }

        if (additionalFields.length > 0) {
            embed.data.fields.push({
                name: 'Additional Info',
                value: additionalFields.join(', '),
                inline: true
            });
        }
    }

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle user moderation history lookup
 * @param {Interaction} interaction - The interaction
 * @param {Guild} guild - The guild
 */
async function handleUserHistory(interaction, guild) {
    const targetUser = interaction.options.getUser('target');
    const limit = interaction.options.getInteger('limit') || 10;
    
    const cases = await getUserModerationHistory(guild.id, targetUser.id, limit);
    
    if (cases.length === 0) {
        const embed = await createEmbed(guild.id, {
            title: 'No Cases Found',
            description: `No moderation cases found for ${targetUser.tag}`,
        });
        await interaction.editReply({ embeds: [embed] });
        return;
    }

    const embed = await createEmbed(guild.id, {
        title: `Moderation History - ${targetUser.tag}`,
        description: `Showing ${cases.length} most recent case(s)`,
        fields: cases.map(moderationCase => ({
            name: `Case #${moderationCase.caseId} - ${formatModerationType(moderationCase.type)}`,
            value: `**Moderator:** ${moderationCase.executorTag}\n**Reason:** ${moderationCase.reason}${moderationCase.duration ? `\n**Duration:** ${moderationCase.duration}` : ''}\n**Date:** <t:${Math.floor(moderationCase.createdAt.getTime() / 1000)}:f>`,
            inline: false
        })),
        footer: {
            text: `User ID: ${targetUser.id}`
        }
    });

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle recent cases lookup
 * @param {Interaction} interaction - The interaction
 * @param {Guild} guild - The guild
 */
async function handleRecentCases(interaction, guild) {
    const limit = interaction.options.getInteger('limit') || 10;
    
    const cases = await getRecentModerationCases(guild.id, limit);
    
    if (cases.length === 0) {
        const embed = await createEmbed(guild.id, {
            title: 'No Cases Found',
            description: 'No moderation cases found for this server',
        });
        await interaction.editReply({ embeds: [embed] });
        return;
    }

    const embed = await createEmbed(guild.id, {
        title: 'Recent Moderation Cases',
        description: `Showing ${cases.length} most recent case(s)`,
        fields: cases.map(moderationCase => ({
            name: `Case #${moderationCase.caseId} - ${formatModerationType(moderationCase.type)}`,
            value: `**Target:** ${moderationCase.targetUserTag}\n**Moderator:** ${moderationCase.executorTag}\n**Reason:** ${moderationCase.reason}${moderationCase.duration ? `\n**Duration:** ${moderationCase.duration}` : ''}\n**Date:** <t:${Math.floor(moderationCase.createdAt.getTime() / 1000)}:f>`,
            inline: false
        })),
        footer: {
            text: `Guild ID: ${guild.id}`
        }
    });

    await interaction.editReply({ embeds: [embed] });
}
