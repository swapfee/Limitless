const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const StaffConfig = require('../../models/StaffConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bind')
        .setDescription('Manage staff role configuration')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a role as a staff role')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to add as staff')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a role from staff roles')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to remove from staff')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View current staff roles configuration'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;
        
        try {
            if (subcommand === 'add') {
                await handleAdd(interaction, guild);
            } else if (subcommand === 'remove') {
                await handleRemove(interaction, guild);
            } else if (subcommand === 'view') {
                await handleView(interaction, guild);
            }
        } catch (error) {
            console.error('Error in bind command:', error);
            const errorEmbed = createErrorEmbed(
                'Staff Role Configuration Failed',
                `An error occurred while configuring staff role: ${error.message}`
            );
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
};

async function handleAdd(interaction, guild) {
    const role = interaction.options.getRole('role');
    
    // Check if the role is already a staff role
    const isCurrentlyStaff = await StaffConfig.isStaffRole(guild.id, role.id);
    
    if (isCurrentlyStaff) {
        const errorEmbed = createErrorEmbed(
            'Staff Role Configuration',
            `**${role.name}** is already set as a staff role.`
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
    }
    
    const result = await StaffConfig.addStaffRole(guild.id, role.id);
    
    if (result.success) {
        const embed = await createEmbed(guild.id, {
            title: 'Staff Role Added',
            description: `Successfully added **${role.name}** as a staff role.`,
            fields: [
                {
                    name: 'Role',
                    value: `${role} (${role.name})`,
                    inline: true
                },
                {
                    name: 'Status',
                    value: 'Added to staff',
                    inline: true
                },
                {
                    name: 'Note',
                    value: 'Staff roles are used to identify users with dangerous permissions for moderation purposes.',
                    inline: false
                }
            ]
        });
        
        await interaction.reply({ embeds: [embed] });
    } else {
        const errorEmbed = createErrorEmbed(
            'Staff Role Configuration Failed',
            result.message
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

async function handleRemove(interaction, guild) {
    const role = interaction.options.getRole('role');
    
    const isCurrentlyStaff = await StaffConfig.isStaffRole(guild.id, role.id);
    
    if (!isCurrentlyStaff) {
        const errorEmbed = createErrorEmbed(
            'Staff Role Configuration',
            `**${role.name}** is not set as a staff role.`
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
    }
    
    const result = await StaffConfig.removeStaffRole(guild.id, role.id);
    
    if (result.success) {
        const embed = await createEmbed(guild.id, {
            title: 'Staff Role Removed',
            description: `Successfully removed **${role.name}** from staff roles.`,
            fields: [
                {
                    name: 'Role',
                    value: `${role} (${role.name})`,
                    inline: true
                },
                {
                    name: 'Status',
                    value: 'Removed from staff',
                    inline: true
                }
            ]
        });
        
        await interaction.reply({ embeds: [embed] });
    } else {
        const errorEmbed = createErrorEmbed(
            'Staff Role Configuration Failed',
            result.message
        );
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

async function handleView(interaction, guild) {
    const staffRoleIds = await StaffConfig.getStaffRoles(guild.id);
    
    if (staffRoleIds.length === 0) {
        const embed = await createEmbed(guild.id, {
            title: 'Staff Roles Configuration',
            description: 'No staff roles are currently configured for this server.',
            fields: [
                {
                    name: 'How to set staff roles',
                    value: 'Use `/bind add @role` to add roles to staff configuration.',
                    inline: false
                },
                {
                    name: 'Why set staff roles?',
                    value: 'Staff roles help the bot identify users with dangerous permissions for moderation features like stripstaff punishment.',
                    inline: false
                }
            ]
        });
        
        await interaction.reply({ embeds: [embed] });
        return;
    }
    
    const staffRoles = [];
    const deletedRoles = [];
    
    for (const roleId of staffRoleIds) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
            staffRoles.push(role);
        } else {
            deletedRoles.push(roleId);
        }
    }
    
    if (deletedRoles.length > 0) {
        for (const roleId of deletedRoles) {
            await StaffConfig.removeStaffRole(guild.id, roleId);
        }
    }
    
    const embed = await createEmbed(guild.id, {
        title: 'Staff Roles Configuration',
        description: `${staffRoles.length} staff role${staffRoles.length !== 1 ? 's' : ''} configured for this server.`,
        fields: [
            {
                name: 'Current Staff Roles',
                value: staffRoles.length > 0 
                    ? staffRoles.map(role => `${role} (${role.name})`).join('\n')
                    : 'None',
                inline: false
            },
            {
                name: 'Management',
                value: 'Use `/bind add @role` to add or `/bind remove @role` to remove roles from staff configuration.',
                inline: false
            }
        ]
    });
    
    if (deletedRoles.length > 0) {
        embed.addFields({
            name: 'Cleanup Notice',
            value: `Removed ${deletedRoles.length} deleted role${deletedRoles.length !== 1 ? 's' : ''} from configuration.`,
            inline: false
        });
    }
    
    await interaction.reply({ embeds: [embed] });
}
