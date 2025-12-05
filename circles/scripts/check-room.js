const fetch = require('node-fetch');

const MATRIX_URL = "http://127.0.0.1:8008"; // Assuming default from codebase
const ROOM_ID = "!tAbIPPkKiguEuqmjid:yourdomain.com";

// Admin credentials (from matrix.ts default)
const ADMIN_USER = "admin";
const ADMIN_PASS = "password";

async function run() {
    console.log(`🔍 Checking room ${ROOM_ID}...`);

    // 1. Login as Admin
    console.log("Logging in as admin...");
    const loginRes = await fetch(`${MATRIX_URL}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "m.login.password", user: ADMIN_USER, password: ADMIN_PASS }),
    });

    if (!loginRes.ok) {
        console.error("Login failed:", await loginRes.text());
        return;
    }

    const { access_token } = await loginRes.json();
    console.log("✅ Admin logged in.");

    // 2. Get Room State (Members) via Admin API (works even if not in room)
    console.log("Fetching room members via Synapse Admin API...");
    const membersRes = await fetch(`${MATRIX_URL}/_synapse/admin/v1/rooms/${encodeURIComponent(ROOM_ID)}/members`, {
        method: "GET",
        headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!membersRes.ok) {
        console.error("Failed to get members:", await membersRes.text());
    } else {
        const data = await membersRes.json();
        console.log(`\n📋 Members (${data.total}):`);
        data.members.forEach(m => console.log(` - ${m}`));
    }
    
    // 3. Try to join admin to room
    console.log("\nAttempting to join Admin to room...");
    const joinRes = await fetch(`${MATRIX_URL}/_matrix/client/v3/join/${encodeURIComponent(ROOM_ID)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}` },
        body: JSON.stringify({})
    });
    
    if (joinRes.ok) {
        console.log("✅ Admin successfully joined!");
    } else {
        console.error("❌ Admin join failed:", await joinRes.text());
        
        // 4. Try Force Join via Admin API
        console.log("Attempting to FORCE join Admin via Admin API...");
        const forceJoinRes = await fetch(`${MATRIX_URL}/_synapse/admin/v1/join/${encodeURIComponent(ROOM_ID)}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: `@${ADMIN_USER}:yourdomain.com` })
        });
        
        if (forceJoinRes.ok) {
             console.log("✅ Admin FORCE join successful!");
        } else {
             console.log("❌ Admin FORCE join failed:", await forceJoinRes.text());
        }
    }
}

run().catch(console.error);
