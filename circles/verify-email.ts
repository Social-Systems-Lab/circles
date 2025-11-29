import { MongoClient } from "mongodb";

const MONGO_HOST = process.env.MONGO_HOST || "127.0.0.1";
const MONGO_PORT = parseInt(process.env.MONGO_PORT || "27017");
const MONGO_CONNECTION_STRING = `mongodb://${MONGO_HOST}:${MONGO_PORT}`;

async function main() {
    const client = new MongoClient(MONGO_CONNECTION_STRING);
    try {
        await client.connect();
        const db = client.db("circles");
        const circles = db.collection("circles");
        
        // Update the user to set isEmailVerified to true
        const result = await circles.updateOne(
            { email: /^second@socialsystems\.io$/i },
            { $set: { isEmailVerified: true } }
        );
        
        if (result.modifiedCount === 1) {
            console.log("✓ Successfully verified email for second@socialsystems.io");
        } else if (result.matchedCount === 1) {
            console.log("✓ User found, email was already verified");
        } else {
            console.log("✗ User not found");
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

main();
