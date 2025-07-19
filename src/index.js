require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const TempBanManager = require('./utils/tempBanManager');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // Privileged intent - must be enabled in Discord Developer Portal
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
    ]
});

// Create collections for commands
client.commands = new Collection();

// Load command handler
require('./handler/slashCommandHandler')(client);

// Load event handler
require('./handler/eventHandler')(client);

// Connect to MongoDB
if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined in environment variables');
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI).then(() => {
    console.log('✅ Connected to MongoDB');
    
    // Initialize TempBan Manager after MongoDB connection
    client.tempBanManager = new TempBanManager(client);
    client.tempBanManager.start(); // Check every 30 seconds by default
    
}).catch((error) => {
    console.error('❌ Error connecting to MongoDB:', error);
    process.exit(1);
});

// Handle process events
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

client.login(process.env.DISCORD_TOKEN);
