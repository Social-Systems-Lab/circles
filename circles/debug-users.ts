
import { MongoClient } from "mongodb";

const MONGO_HOST = process.env.MONGO_HOST || "127.0.0.1";
const MONGO_PORT = parseInt(process.env.MONGO_PORT || "27017");
const MONGO_ADMIN_USER = process.env.MONGO_ROOT_USERNAME || "admin";
const MONGO_ADMIN_PASSWORD = process.env.MONGO_ROOT_PASSWORD || "password";
const MONGO_CONNECTION_STRING = `mongodb://${MONGO_HOST}:${MONGO_PORT}`;

async function main() {
    const client = new MongoClient(MONGO_CONNECTION_STRING);
    try {
        await client.connect();
        const db = client.db("circles");
        const circles = db.collection("circles");
        const { ObjectId } = require("mongodb");
        const user = await circles.findOne({ _id: new ObjectId('690f10ff4ec37e48e1ad278e') });
        if (user) {
            console.log(`User Found: DID=${user.did}, Name=${user.name}`);
        } else {
            console.log("User not found");
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

main();
