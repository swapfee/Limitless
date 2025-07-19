const fs = require('fs');
const path = require('path');

module.exports = (client) => {
    const eventsPath = path.join(__dirname, '..', 'events');
    
    if (!fs.existsSync(eventsPath)) {
        console.log(`⚠️  Events directory not found: ${eventsPath}`);
        return;
    }
    
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
            console.log(`✅ Loaded event (once): ${event.name}`);
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
            console.log(`✅ Loaded event: ${event.name}`);
        }
    }
    
    console.log(`📁 Loaded events from ${eventsPath}`);
};
