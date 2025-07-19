const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require('../../utils/embedUtils');
const GuildConfig = require('../../models/GuildConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('embedcolor')
        .setDescription('Manage the server\'s embed color')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a new embed color for the server')
                .addStringOption(option =>
                    option
                        .setName('color')
                        .setDescription('Hex color code (e.g., #722F37 for wine red)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View the current embed color')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset embed color to default (wine red)')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        try {
            switch (subcommand) {
                case 'set':
                    await handleSetColor(interaction);
                    break;
                case 'view':
                    await handleViewColor(interaction);
                    break;
                case 'reset':
                    await handleResetColor(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error in embedcolor command:', error);
            const errorEmbed = createErrorEmbed(
                'Command Error',
                'An error occurred while processing your request.'
            );
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },
};

async function handleSetColor(interaction) {
    const colorInput = interaction.options.getString('color');
    
    // Validate hex color format
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexColorRegex.test(colorInput)) {
        const errorEmbed = createErrorEmbed(
            'Invalid Color Format',
            'Please provide a valid hex color code (e.g., `#722F37` or `#F00`)'
        );
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    // Normalize 3-digit hex to 6-digit
    let normalizedColor = colorInput;
    if (colorInput.length === 4) {
        normalizedColor = '#' + colorInput.slice(1).split('').map(char => char + char).join('');
    }
    
    const config = await GuildConfig.getGuildConfig(interaction.guild.id);
    await config.setEmbedColor(normalizedColor);
    
    const successEmbed = createSuccessEmbed(
        'Embed Color Updated',
        `The server's embed color has been changed to \`${normalizedColor}\``
    );
    successEmbed.setColor(parseInt(normalizedColor.replace('#', ''), 16));
    
    await interaction.reply({ embeds: [successEmbed] });
}

async function handleViewColor(interaction) {
    const config = await GuildConfig.getGuildConfig(interaction.guild.id);
    
    const embed = await createEmbed(interaction.guild.id, {
        title: 'Current Embed Color',
        description: `**Color Code:** \`${config.embedColor}\`\n**Preview:** This embed shows the current color!`,
        fields: [
            {
                name: 'RGB Value',
                value: hexToRgb(config.embedColor),
                inline: true
            },
            {
                name: 'Integer Value',
                value: config.getEmbedColorInt().toString(),
                inline: true
            }
        ]
    });
    
    await interaction.reply({ embeds: [embed] });
}

async function handleResetColor(interaction) {
    const config = await GuildConfig.getGuildConfig(interaction.guild.id);
    await config.setEmbedColor('#722F37'); // Wine red default
    
    const successEmbed = createSuccessEmbed(
        'Color Reset',
        'The server\'s embed color has been reset to the default wine red (`#722F37`)'
    );
    successEmbed.setColor(0x722F37);
    
    await interaction.reply({ embeds: [successEmbed] });
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
        `rgb(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)})` : 
        'Invalid';
}
