// matrix.ts
import { ChatRoom, Circle, UserPrivate } from "@/models/models";
import crypto from "crypto";
import { updateCircle } from "./circle";
import { getServerSettings, updateServerSettings } from "./server-settings";

const MATRIX_HOST = process.env.MATRIX_HOST || "127.0.0.1";
const MATRIX_PORT = parseInt(process.env.MATRIX_PORT || "8008");
const MATRIX_URL = `http://${MATRIX_HOST}:${MATRIX_PORT}`;
const MATRIX_SHARED_SECRET = process.env.MATRIX_SHARED_SECRET || "your_shared_secret";
const MATRIX_DOMAIN = process.env.MATRIX_DOMAIN || "yourdomain.com";
const GLOBAL_ROOM_ALIAS = "global";

export async function getAdminAccessToken(): Promise<string> {
    let serverSettings = await getServerSettings();
    if (serverSettings.matrixAdminAccessToken) {
        return serverSettings.matrixAdminAccessToken;
    }
    const adminUsername = "admin";
    const adminPassword = process.env.MATRIX_ADMIN_PASSWORD || "admin";

    const nonce = await generateNonce();
    const mac = generateMac(nonce, adminUsername, adminPassword, true);

    // Check if admin user exists
    const checkUserResponse = await fetch(`${MATRIX_URL}/_synapse/admin/v1/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${MATRIX_SHARED_SECRET}` },
        body: JSON.stringify({
            username: adminUsername,
            password: adminPassword,
            admin: true, // Ensure the user is created as an admin
            nonce,
            mac,
        }),
    });

    const responseJson = await checkUserResponse.json();

    if (responseJson.errcode === "M_USER_IN_USE") {
        console.log("Admin user already exists. Attempting login to fetch access token.");

        // Login existing admin user to get access token
        const loginResponse = await fetch(`${MATRIX_URL}/_matrix/client/v3/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: "m.login.password",
                user: adminUsername,
                password: adminPassword,
            }),
        });

        if (!loginResponse.ok) {
            console.error("Failed to login existing admin user:", await loginResponse.text());
            throw new Error("Admin user login failed");
        }

        const loginData = await loginResponse.json();
        console.log("Successfully logged in admin user, access token acquired.");
        let access_token = loginData.access_token;

        // store access token in server settings
        serverSettings.matrixAdminAccessToken = access_token;
        await updateServerSettings(serverSettings);

        return loginData.access_token;
    }

    if (!checkUserResponse.ok) {
        console.error("Failed to create admin user:", responseJson);
        throw new Error(`Failed to create admin user: ${responseJson.error}`);
    }

    console.log("Admin user successfully created.");

    // Fetch access token for newly created admin user
    const loginResponse = await fetch(`${MATRIX_URL}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            type: "m.login.password",
            user: adminUsername,
            password: adminPassword,
        }),
    });

    if (!loginResponse.ok) {
        console.error("Failed to login newly created admin user:", await loginResponse.text());
        throw new Error("Admin user login failed after creation");
    }

    const loginData = await loginResponse.json();
    console.log("Successfully logged in newly created admin user, access token acquired.");

    // store access token in server settings
    serverSettings.matrixAdminAccessToken = loginData.access_token;
    await updateServerSettings(serverSettings);

    return loginData.access_token;
}

export async function registerOrLoginMatrixUser(user: UserPrivate): Promise<string> {
    let username = user.matrixUsername;
    let password = user.matrixPassword;

    if (!username) {
        username = user.handle!;
        password = crypto.randomBytes(16).toString("hex");
        user.matrixUsername = username;
        user.matrixPassword = password;

        // TODO check if username exists in matrix db and retry with a different username
        while (await checkIfMatrixUserExists(username)) {
            // append a random number to the username to make it unique
            username += Math.floor(Math.random() * 10);
        }
        user.matrixUsername = username;
        user.fullMatrixName = `@${username}:${MATRIX_DOMAIN}`;
        await updateCircle({
            _id: user._id,
            matrixUsername: username,
            matrixPassword: password,
        });
    }

    // get admin access token
    let adminAccessToken = await getAdminAccessToken();

    // Check if user exists
    const checkUserResponse = await fetch(`${MATRIX_URL}/_synapse/admin/v2/users/@${username}:${MATRIX_DOMAIN}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${adminAccessToken}` },
    });

    if (checkUserResponse.ok) {
        const userInfo = await checkUserResponse.json();
        console.log("Matrix user exists:", userInfo);
        let access_token = await loginMatrixUser(username, password!);
        user.matrixAccessToken = access_token;

        // add user notifications room if not available
        if (!user.matrixNotificationsRoomId) {
            user.matrixNotificationsRoomId = await addUserNotificationsRoom(user);
        }

        await updateCircle({
            _id: user._id,
            matrixAccessToken: access_token,
            matrixNotificationsRoomId: user.matrixNotificationsRoomId,
        });
        return access_token;
    }

    // User does not exist, create them using the v2 API
    console.log("Matrix user does not exist, creating");
    const registerResponse = await fetch(`${MATRIX_URL}/_synapse/admin/v2/users/@${username}:${MATRIX_DOMAIN}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminAccessToken}` },
        body: JSON.stringify({
            password,
            admin: false,
            displayname: user.name, // optional, set a display name if needed
        }),
    });

    if (!registerResponse.ok) {
        const errorResponse = await registerResponse.text();
        console.error("Matrix registration failed", errorResponse);
        throw new Error(`Matrix registration failed: ${errorResponse}`);
    }

    console.log("Matrix user created successfully");

    const accessToken = await loginMatrixUser(username, password!);

    user.matrixAccessToken = accessToken;
    user.matrixNotificationsRoomId = await addUserNotificationsRoom(user);
    await updateCircle({
        _id: user._id,
        matrixAccessToken: accessToken,
        matrixNotificationsRoomId: user.matrixNotificationsRoomId,
    });

    return accessToken;
}

export async function checkIfMatrixUserExists(username: string): Promise<boolean> {
    let adminAccessToken = await getAdminAccessToken();

    const checkUserResponse = await fetch(`${MATRIX_URL}/_synapse/admin/v2/users/@${username}:${MATRIX_DOMAIN}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${adminAccessToken}` },
    });

    return checkUserResponse.ok;
}

export async function loginMatrixUser(username: string, password: string): Promise<string> {
    const loginResponse = await fetch(`${MATRIX_URL}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "m.login.password", user: username, password }),
    });

    if (!loginResponse.ok) {
        console.error("Failed to login user to Matrix:", await loginResponse.text());
        throw new Error("Matrix login failed");
    }

    const { access_token } = await loginResponse.json();
    return access_token;
}

// Helper to add a user to a room
export async function addUserToRoom(accessToken: string, roomId: string): Promise<void> {
    const response = await fetch(`${MATRIX_URL}/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        console.error(`Failed to add user to room ${roomId}`, await response.text());
        throw new Error(`Failed to add user to room ${roomId}`);
    }

    console.log(`User successfully added to room ${roomId}`);
}

async function getUserNotificationsRoom(user: Circle): Promise<string> {
    let adminAccessToken = await getAdminAccessToken();
    let notificationsRoomId = `${user._id.toString()}-notification`;
    const aliasWithHash = `#${notificationsRoomId}:${MATRIX_DOMAIN}`;

    try {
        // Check if the room already exists
        const response = await fetch(
            `${MATRIX_URL}/_matrix/client/v3/directory/room/${encodeURIComponent(aliasWithHash)}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${adminAccessToken}`,
                },
            },
        );

        if (response.ok) {
            const { room_id } = await response.json();
            console.log("User notifications chat room already exists:", room_id);
            return room_id; // Return existing room ID
        } else {
            console.error("Failed to get user notifications room", await response.text());
        }
    } catch (error) {
        console.warn("User noitfications chat room does not exist. Creating a new one.");
    }

    // Create the room if it doesn't exist
    const createResponse = await fetch(`${MATRIX_URL}/_matrix/client/v3/createRoom`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${adminAccessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: "User Notifications",
            room_alias_name: notificationsRoomId,
            visibility: "public",
            preset: "public_chat",
        }),
    });

    if (!createResponse.ok) {
        console.error("Failed to create user notifications chat room", await createResponse.text());

        throw new Error("Failed to create user notifications chat room");
    }

    const { room_id } = await createResponse.json();
    console.log("User notifications chat room created:", room_id);
    return room_id; // Return newly created room ID
}

export async function addUserNotificationsRoom(user: Circle): Promise<string> {
    const roomId = await getUserNotificationsRoom(user);
    await addUserToRoom(user.matrixAccessToken!, roomId);
    return roomId;
}

export async function createMatrixRoom(
    alias: string,
    name: string,
    topic: string,
): Promise<{ roomId: string | undefined }> {
    let adminAccessToken = await getAdminAccessToken();

    const response = await fetch(`${MATRIX_URL}/_matrix/client/v3/createRoom`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${adminAccessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: name,
            room_alias_name: alias,
            topic,
            visibility: "public",
            preset: "public_chat",
        }),
    });

    if (!response.ok) {
        console.error("Failed to create Matrix room", await response.text());
        return { roomId: undefined };
    }

    const data = await response.json();
    return { roomId: data.room_id };
}

async function generateNonce(): Promise<string> {
    const response = await fetch(`${MATRIX_URL}/_synapse/admin/v1/register`, {
        method: "GET",
        headers: { Authorization: `Bearer ${MATRIX_SHARED_SECRET}` },
    });

    if (!response.ok) {
        console.error("Failed to get nonce for Matrix registration", await response.text());
        throw new Error("Failed to get nonce");
    }

    const data = await response.json();
    return data.nonce;
}

function generateMac(nonce: string, username: string, password: string, isAdmin: boolean): string {
    const data = `${nonce}\0${username}\0${password}\0${isAdmin ? "admin" : "notadmin"}`;
    return crypto.createHmac("sha1", MATRIX_SHARED_SECRET).update(data).digest("hex");
}

export const sendReadReceipt = async (roomId: string, eventId: string) => {
    let adminAccessToken = await getAdminAccessToken();

    const encodedRoomId = encodeURIComponent(roomId);
    const encodedEventId = encodeURIComponent(eventId);

    const url = `${MATRIX_URL}/client/v3/rooms/${encodedRoomId}/receipt/m.read/${encodedEventId}`;

    console.log(`Sending read receipt for event: ${eventId} in room: ${roomId}`);
    console.log(adminAccessToken);
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${adminAccessToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            console.error("Failed to send read receipt:", response.statusText);
        } else {
            console.log(`Read receipt sent for event: ${eventId} in room: ${roomId}`);
        }
    } catch (error) {
        console.error("Error sending read receipt:", error);
    }
};
