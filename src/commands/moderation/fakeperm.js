const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const FakePermissions = require('../../models/FakePermissions');

const PERMISSION_DESCRIPTIONS = {
    'ban_members': 'Ban members from the server',
    'kick_members': 'Kick members from the server',
    'timeout_members': 'Timeout members in the server',
    'manage_messages': 'Delete and manage messages',
    'manage_roles': 'Manage and assign roles',
    'manage_channels': 'Manage server channels',
    'manage_nicknames': 'Manage member nicknames',
    'view_audit_log': 'View server audit log',
    'administrator': 'Full administrative access (all fake permissions)'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fakeperm')
        .setDescription('Manage fake permissions for roles')
        .addSubcommand(subcommand =>
            subcommand
                .setName('grant')
                .setDescription('Grant a fake permission to a role')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to grant fake permission to')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('permission')
                        .setDescription('The fake permission to grant')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Ban Members', value: 'ban_members' },
                            { name: 'Kick Members', value: 'kick_members' },
                            { name: 'Timeout Members', value: 'timeout_members' },
                            { name: 'Manage Messages', value: 'manage_messages' },
                            { name: 'Manage Roles', value: 'manage_roles' },
                            { name: 'Manage Channels', value: 'manage_channels' },
                            { name: 'Manage Nicknames', value: 'manage_nicknames' },
                            { name: 'View Audit Log', value: 'view_audit_log' },
                            { name: 'Administrator', value: 'administrator' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('revoke')
                .setDescription('Revoke a fake permission from a role')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to revoke fake permission from')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('permission')
                        .setDescription('The fake permission to revoke')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Ban Members', value: 'ban_members' },
                            { name: 'Kick Members', value: 'kick_members' },
                            { name: 'Timeout Members', value: 'timeout_members' },
                            { name: 'Manage Messages', value: 'manage_messages' },
                            { name: 'Manage Roles', value: 'manage_roles' },
                            { name: 'Manage Channels', value: 'manage_channels' },
                            { name: 'Manage Nicknames', value: 'manage_nicknames' },
                            { name: 'View Audit Log', value: 'view_audit_log' },
                            { name: 'Administrator', value: 'administrator' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List fake permissions for a role')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to check fake permissions for')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear all fake permissions from a role')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to clear all fake permissions from')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('listall')
                .setDescription('List all roles with fake permissions in this server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check what fake permissions a user has through their roles')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to check fake permissions for')
                        .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;
        
        try {
            switch (subcommand) {
                case 'grant':
                    await handleGrant(interaction, guild);
                    break;
                case 'revoke':
                    await handleRevoke(interaction, guild);
                    break;
                case 'list':
                    await handleList(interaction, guild);
                    break;
                case 'clear':
                    await handleClear(interaction, guild);
                    break;
                case 'listall':
                    await handleListAll(interaction, guild);
                    break;
                case 'check':
                    await handleCheck(interaction, guild);
                    break;
            }
        } catch (error) {
            console.error('Error in fakeperm command:', error);
            const errorEmbed = createErrorEmbed(
                'Fake Permissions Failed',
                `An error occurred while managing fake permissions: ${error.message}`
            );
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};

async function handleGrant(interaction, guild) {
    const role = interaction.options.getRole('role');
    const permission = interaction.options.getString('permission');
    
    const result = await FakePermissions.grantPermission(guild.id, role.id, permission, interaction.user.id);
    
    if (result.success) {
        const embed = await createEmbed(guild.id, {
            title: 'Fake Permission Granted',
            description: `Successfully granted **${PERMISSION_DESCRIPTIONS[permission]}** to ${role}.`,
            fields: [
                {
                    name: 'Role',
                    value: `${role} (${role.name})`,
                    inline: true
                },
                {
                    name: 'Permission',
                    value: PERMISSION_DESCRIPTIONS[permission],
                    inline: true
                },
                {
                    name: 'Granted By',
                    value: `${interaction.user}`,
                    inline: true
                },
                {
                    name: 'Security Note',
                    value: 'Users with this role can now use bot commands with this permission but cannot use native Discord features.',
                    inline: false
                }
            ]
        });
        
        await interaction.editReply({ embeds: [embed] });
    } else {
        const errorEmbed = createErrorEmbed('Permission Grant Failed', result.message);
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleRevoke(interaction, guild) {
    const role = interaction.options.getRole('role');
    const permission = interaction.options.getString('permission');
    
    const result = await FakePermissions.revokePermission(guild.id, role.id, permission);
    
    if (result.success) {
        const embed = await createEmbed(guild.id, {
            title: 'Fake Permission Revoked',
            description: `Successfully revoked **${PERMISSION_DESCRIPTIONS[permission]}** from ${role}.`,
            fields: [
                {
                    name: 'Role',
                    value: `${role} (${role.name})`,
                    inline: true
                },
                {
                    name: 'Permission',
                    value: PERMISSION_DESCRIPTIONS[permission],
                    inline: true
                },
                {
                    name: 'Revoked By',
                    value: `${interaction.user}`,
                    inline: true
                }
            ]
        });
        
        await interaction.editReply({ embeds: [embed] });
    } else {
        const errorEmbed = createErrorEmbed('Permission Revoke Failed', result.message);
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleList(interaction, guild) {
    const role = interaction.options.getRole('role');
    const permissions = await FakePermissions.getRolePermissions(guild.id, role.id);
    
    if (permissions.length === 0) {
        const embed = await createEmbed(guild.id, {
            title: 'Fake Permissions',
            description: `${role} has no fake permissions in this server.`,
            fields: [
                {
                    name: 'Role',
                    value: `${role} (${role.name})`,
                    inline: true
                }
            ]
        });
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const embed = await createEmbed(guild.id, {
        title: 'Fake Permissions',
        description: `${role} has ${permissions.length} fake permission${permissions.length !== 1 ? 's' : ''} in this server.`,
        fields: [
            {
                name: 'Role',
                value: `${role} (${role.name})`,
                inline: true
            },
            {
                name: 'Permissions',
                value: permissions.map(perm => `• ${PERMISSION_DESCRIPTIONS[perm]}`).join('\n'),
                inline: false
            },
            {
                name: 'Note',
                value: 'These permissions only work with bot commands, not native Discord features.',
                inline: false
            }
        ]
    });
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleClear(interaction, guild) {
    const role = interaction.options.getRole('role');
    const result = await FakePermissions.revokeAllPermissions(guild.id, role.id);
    
    const embed = await createEmbed(guild.id, {
        title: 'Fake Permissions Cleared',
        description: result.success 
            ? `Successfully cleared all fake permissions from ${role}.`
            : `${role} had no fake permissions to clear.`,
        fields: [
            {
                name: 'Role',
                value: `${role} (${role.name})`,
                inline: true
            },
            {
                name: 'Action',
                value: result.success ? 'All permissions removed' : 'No permissions found',
                inline: true
            },
            {
                name: 'Cleared By',
                value: `${interaction.user}`,
                inline: true
            }
        ]
    });
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleListAll(interaction, guild) {
    const allPermissions = await FakePermissions.getAllGuildPermissions(guild.id);
    
    if (allPermissions.length === 0) {
        const embed = await createEmbed(guild.id, {
            title: 'Server Fake Permissions',
            description: 'No roles have fake permissions in this server.',
            fields: [
                {
                    name: 'Getting Started',
                    value: 'Use `/fakeperm grant @role permission` to start granting fake permissions.',
                    inline: false
                }
            ]
        });
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const roleList = [];
    for (const rolePerms of allPermissions) {
        const role = guild.roles.cache.get(rolePerms.roleId);
        if (role) {
            const permCount = rolePerms.permissions.length;
            roleList.push(`${role} - ${permCount} permission${permCount !== 1 ? 's' : ''}`);
        }
    }
    
    const embed = await createEmbed(guild.id, {
        title: 'Server Fake Permissions',
        description: `${allPermissions.length} role${allPermissions.length !== 1 ? 's' : ''} with fake permissions in this server.`,
        fields: [
            {
                name: 'Roles with Fake Permissions',
                value: roleList.length > 0 ? roleList.join('\n') : 'No valid roles found',
                inline: false
            },
            {
                name: 'Management',
                value: 'Use `/fakeperm list @role` to see specific permissions for a role.',
                inline: false
            }
        ]
    });
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleCheck(interaction, guild) {
    const user = interaction.options.getUser('user');
    const member = await guild.members.fetch(user.id).catch(() => null);
    
    if (!member) {
        const errorEmbed = createErrorEmbed('User Not Found', 'User is not a member of this server.');
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
    }
    
    const userRoleIds = member.roles.cache.map(role => role.id);
    const permissions = await FakePermissions.getUserPermissions(guild.id, userRoleIds);
    
    if (permissions.length === 0) {
        const embed = await createEmbed(guild.id, {
            title: 'User Fake Permissions',
            description: `${user} has no fake permissions through their roles.`,
            fields: [
                {
                    name: 'User',
                    value: `${user} (${user.tag})`,
                    inline: true
                },
                {
                    name: 'Roles Checked',
                    value: member.roles.cache.size > 1 
                        ? `${member.roles.cache.size - 1} role${member.roles.cache.size - 1 !== 1 ? 's' : ''}`
                        : 'No roles',
                    inline: true
                }
            ]
        });
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    // Get which roles provide fake permissions
    const allRolePermissions = await FakePermissions.getAllGuildPermissions(guild.id);
    const userFakePermissionRoles = allRolePermissions
        .filter(rolePerm => userRoleIds.includes(rolePerm.roleId))
        .map(rolePerm => {
            const role = guild.roles.cache.get(rolePerm.roleId);
            return role ? `${role.name} (${rolePerm.permissions.length} perm${rolePerm.permissions.length !== 1 ? 's' : ''})` : null;
        })
        .filter(Boolean);
    
    const embed = await createEmbed(guild.id, {
        title: 'User Fake Permissions',
        description: `${user} has ${permissions.length} fake permission${permissions.length !== 1 ? 's' : ''} through their roles.`,
        fields: [
            {
                name: 'User',
                value: `${user} (${user.tag})`,
                inline: true
            },
            {
                name: 'Permissions',
                value: permissions.map(perm => `• ${PERMISSION_DESCRIPTIONS[perm]}`).join('\n'),
                inline: false
            },
            {
                name: 'Permission Sources',
                value: userFakePermissionRoles.join('\n') || 'None',
                inline: false
            },
            {
                name: 'Note',
                value: 'These permissions only work with bot commands, not native Discord features.',
                inline: false
            }
        ]
    });
    
    await interaction.editReply({ embeds: [embed] });
}
