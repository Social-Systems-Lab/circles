import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/circles_registry";
const client = new MongoClient(uri);

export const connectToDatabase = async () => {
    await client.connect();
    console.log("Connected to MongoDB");
    return client.db();
};
