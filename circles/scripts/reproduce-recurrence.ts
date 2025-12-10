
import { client, Circles, Events } from "../src/lib/data/db";
import { createEvent, updateEvent, getEventById } from "../src/lib/data/event";
import { Circle, Event } from "../src/models/models";
import { ObjectId } from "mongodb";

async function run() {
    try {
        console.log("Connecting to DB...");
        // Wait for connection (client.connect() is called in db.ts but async, might need to wait or rely on await operations)
        // Actually best to explicitly connect if db.ts doesn't export a promise or if we want to be sure.
        // db.ts calls client.connect().catch... so it starts connecting.
        // Queries normally wait for topology? Or maybe not.
        // Let's await client.connect() again to be sure? No, it might error if already connecting.
        // We'll just try to query.
        
        // Find a user circle
        console.log("Finding a user circle...");
        // We need a circle to assign as creator.
        const circle = await Circles.findOne({ circleType: "user" });
        if (!circle) {
            console.error("No user circle found. Cannot proceed.");
            process.exit(1);
        }
        console.log(`Using circle: ${circle.handle} (${circle._id})`);

        // Create an event with recurrence
        const eventData: any = {
            circleId: circle._id!.toString(),
            createdBy: circle.did || "did:test",
            title: "Test Recurring Persistence",
            description: "Testing recurrence",
            startAt: new Date(),
            endAt: new Date(Date.now() + 3600000),
            recurrence: {
                frequency: "weekly",
                interval: 1,
                count: 5
            },
            images: [],
            userGroups: [],
        };

        console.log("Creating event...", eventData.recurrence);
        const createdEvent = await createEvent(eventData, circle);
        console.log(`Event created: ${createdEvent._id}`);
        console.log(`Created Recurrence:`, createdEvent.recurrence);

        if (!createdEvent.recurrence) {
            console.error("FAILURE: Recurrence missing immediately after creation.");
        } else {
            console.log("SUCCESS: Recurrence present after creation.");
        }

        const eventId = createdEvent._id!.toString();

        // Update event with DIFFERENT recurrence
        console.log("Updating persistence with new recurrence...");
        const newRecurrence = {
            frequency: "daily",
            interval: 2,
            count: 10
        };
        
        const success = await updateEvent(eventId, { recurrence: newRecurrence as any }, circle);
        console.log(`Update success: ${success}`);

        // Fetch back
        const updatedEvent = await getEventById(eventId, circle.did || "");
        console.log(`Updated Recurrence from DB:`, updatedEvent?.recurrence);

        if (updatedEvent?.recurrence?.frequency === "daily" && updatedEvent.recurrence.interval === 2) {
             console.log("SUCCESS: Recurrence updated and persisted correctly.");
        } else {
             console.error("FAILURE: Recurrence NOT updated correctly.");
        }
        
        // Clean up
        console.log("Cleaning up...");
        await Events.deleteOne({ _id: createdEvent._id });

    } catch (e) {
        console.error("Error in reproduction script:", e);
    } finally {
        console.log("Closing connection...");
        await client.close();
    }
}

run();
