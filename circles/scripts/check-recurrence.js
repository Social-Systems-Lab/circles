
const { MongoClient } = require('mongodb');

const uri = "mongodb://circles_local:circles_local_pw@127.0.0.1:27017/circles?authSource=admin";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const database = client.db('circles');
    const events = database.collection('events');

    // Get the most recent event
    const event = await events.findOne({}, { sort: { updatedAt: -1 } });

    if (!event) {
        console.log("No events found.");
    } else {
        console.log("Most recent event:");
        console.log("ID:", event._id);
        console.log("Title:", event.title);
        console.log("Recurrence Field:", JSON.stringify(event.recurrence, null, 2));
    }

  } finally {
    await client.close();
  }
}

run().catch(console.dir);
