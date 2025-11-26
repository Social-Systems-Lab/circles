import { MongoClient, ObjectId } from "mongodb";

const MONGO_HOST = process.env.MONGO_HOST || "127.0.0.1";
const MONGO_PORT = parseInt(process.env.MONGO_PORT || "27017");
const MONGO_CONNECTION_STRING = `mongodb://${MONGO_HOST}:${MONGO_PORT}`;

async function main() {
    const client = new MongoClient(MONGO_CONNECTION_STRING);
    try {
        await client.connect();
        const db = client.db("circles");
        const circles = db.collection("circles");
        
        // Delete the user
        const result = await circles.deleteOne({ _id: new ObjectId('690f10ff4ec37e48e1ad278e') });
        
        if (result.deletedCount === 1) {
            console.log("✓ Successfully deleted user local@socialsystems.io");
        } else {
            console.log("✗ User not found or already deleted");
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

main();
