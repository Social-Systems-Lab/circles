const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');

// Config from .env.local
const MONGO_URI = "mongodb://circles_local:circles_local_pw@127.0.0.1:27017/circles?authSource=admin";
const MATRIX_URL = "http://127.0.0.1:8008";
const ROOM_ID = "!tAbIPPkKiguEuqmjid:yourdomain.com";
const ADMIN_MXID = "@admin:yourdomain.com";
const LOCAL_TIM_HANDLE = "local-tim"; // Based on @local-tim:yourdomain.com

async function run() {
    console.log("🛠️  Starting Room Fix...");
    
    // 1. Connect to Mongo to update Local Tim's token
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db("circles");
        
        console.log(`Finding user with matrix username matching ${LOCAL_TIM_HANDLE}...`);
        
        // Find user. Circles stores UserPrivate data mixed with Circle data or separate?
        // In this app, it seems 'circles' collection holds user data.
        const user = await db.collection("circles").findOne({ 
            matrixUsername: LOCAL_TIM_HANDLE 
        });
        
        if (!user) {
            console.error("❌ Could not find Local Tim user in DB!");
            return;
        }
        
        const token = user.matrixAccessToken;
        if (!token) {
             console.error("❌ Local Tim has no Matrix Access Token!");
             return;
        }
        
        console.log(`✅ Found Local Tim. Token starts with: ${token.substring(0, 5)}...`);
        
        // 2. Send Invite
        console.log(`Sending invite to ${ADMIN_MXID} for room ${ROOM_ID}...`);
        const inviteRes = await fetch(`${MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(ROOM_ID)}/invite`, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ user_id: ADMIN_MXID })
        });
        
        if (inviteRes.ok) {
            console.log("✅ Invite sent successfully!");
        } else {
            const err = await inviteRes.text();
            console.error("❌ Invite failed:", err);
            
            if (err.includes("already in the room")) {
                console.log("ℹ️ User is already in the room (or invited).");
            }
        }
        
    } catch (e) {
        console.error("Script error:", e);
    } finally {
        await client.close();
    }
}

run();
