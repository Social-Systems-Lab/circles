const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

function getEnvVar(key) {
    try {
        const envPath = path.join(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            const lines = content.split('\n');
            for (const line of lines) {
                if (line.startsWith(key + '=')) {
                    return line.substring(key.length + 1).replace(/"/g, '').trim();
                }
            }
        }
    } catch (e) {
        console.error("Error reading .env.local", e);
    }
    return null;
}

async function checkEvent() {
    let client;
    try {
        const uri = getEnvVar('MONGODB_URI');
        if (!uri) {
            console.error("MONGODB_URI not found in .env.local");
            return;
        }

        client = new MongoClient(uri);
        await client.connect();
        
        const dbName = getEnvVar('MONGODB_DB_NAME') || 'circles_db';
        const db = client.db(dbName);
        const eventsCollection = db.collection('events');

        // ID from user logs
        const eventId = "6933ba12fb928e18ec2e6109"; 

        console.log(`Checking event ${eventId}...`);
        const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });

        if (!event) {
            console.log("Event not found!");
        } else {
            console.log("Event found:");
            // Log relevant fields only to keep output clean
            console.log({
                _id: event._id,
                title: event.title,
                recurrence: event.recurrence,
                startAt: event.startAt,
                endAt: event.endAt
            });
        }

    } catch (e) {
        console.error(e);
    } finally {
        if (client) await client.close();
    }
}

checkEvent();
