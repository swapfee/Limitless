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
        const eventExports = require(filePath);
        
        // Handle special case for snipeProtection which exports multiple events
        if (file === 'messageDelete.js') {
            // Register the main MessageDelete event
            if (eventExports.name && eventExports.execute) {
                if (eventExports.once) {
                    client.once(eventExports.name, (...args) => eventExports.execute(...args, client));
                    console.log(`✅ Loaded event (once): ${eventExports.name} from ${file}`);
                } else {
                    client.on(eventExports.name, (...args) => eventExports.execute(...args, client));
                    console.log(`✅ Loaded event: ${eventExports.name} from ${file}`);
                }
            }
            
            // Register the MessageUpdate event
            if (eventExports.messageEditEvent) {
                const editEvent = eventExports.messageEditEvent;
                if (editEvent.once) {
                    client.once(editEvent.name, (...args) => editEvent.execute(...args, client));
                    console.log(`✅ Loaded event (once): ${editEvent.name} from ${file}`);
                } else {
                    client.on(editEvent.name, (...args) => editEvent.execute(...args, client));
                    console.log(`✅ Loaded event: ${editEvent.name} from ${file}`);
                }
            }
        } else {
            // Handle normal event files
            const event = eventExports;
            
            if (event.name && event.execute) {
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args, client));
                    console.log(`✅ Loaded event (once): ${event.name} from ${file}`);
                } else {
                    client.on(event.name, (...args) => event.execute(...args, client));
                    console.log(`✅ Loaded event: ${event.name} from ${file}`);
                }
            } else {
                console.log(`⚠️  Event file ${file} is missing required 'name' or 'execute' properties`);
            }
        }
    }
    
    console.log(`📁 Loaded events from ${eventsPath}`);
};
