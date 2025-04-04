// matrix.ts - Matrix chat functionality
import { ChatRoom, Circle, NotificationType, UserPrivate, Post, Comment } from "@/models/models";
import crypto from "crypto";
import { getCirclesByDids, updateCircle } from "./circle";
import { getServerSettings, updateServerSettings } from "./server-settings";
import { getPrivateUserByDid, getUser } from "./user";
import { getMembers } from "./member";

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
        // get username from handle but lowercase
        username = user.handle!.toLowerCase();
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

export async function removeUserFromRoom(userId: string, roomId: string): Promise<void> {
    const adminAccessToken = await getAdminAccessToken();
    // userId might be "@alice:yourdomain.com" or similar
    const url = `${MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${adminAccessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            user_id: userId, // The Matrix user to remove
            reason: "Leaving circle",
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed removing user: ${error}`);
    }
}

export async function updateMatrixRoomNameAndAvatar(roomId: string, newName: string, avatarUrl?: string) {
    const adminAccessToken = await getAdminAccessToken();

    // Update the room's name
    {
        const nameRes = await fetch(
            `${MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name`,
            {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${adminAccessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name: newName }),
            },
        );
        if (!nameRes.ok) {
            throw new Error(`Failed updating room name: ${await nameRes.text()}`);
        }
    }

    // Optional: set an avatar for the room
    if (avatarUrl) {
        const avatarRes = await fetch(
            `${MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.avatar`,
            {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${adminAccessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    url: avatarUrl, // Should be a valid mxc:// URL.
                    // You can also do an upload to the homeserver if needed,
                    // then pass the returned mxc:// in here.
                }),
            },
        );
        if (!avatarRes.ok) {
            throw new Error(`Failed updating room avatar: ${await avatarRes.text()}`);
        }
    }
}

export async function notifyNewMember(userDid: string, circle: Circle, omitFollowAccepted?: boolean) {
    const newMemberUser = await getUser(userDid);
    const members = await getMembers(circle._id!);
    const otherMembersIds = members.filter((member) => member.userDid !== userDid).map((x) => x.userDid);
    let recipients = await getCirclesByDids(otherMembersIds);

    // Send new follower notification to all existing followers
    if (circle.circleType !== "user") {
        await sendNotifications("new_follower", recipients, { circle, user: newMemberUser });
    }
    // Send "follow_accepted" notification to the new follower
    if (!omitFollowAccepted) {
        await sendNotifications("follow_accepted", [newMemberUser], { circle, user: newMemberUser });
    }
}

export async function sendNotifications(
    notificationType: NotificationType,
    recipients: Circle[],
    payload: {
        circle?: Circle;
        user?: Circle;
        post?: Post;
        comment?: Comment;
        reaction?: string;
        postId?: string;
        commentId?: string;
        project?: Circle;
        projectId?: string;
    },
): Promise<void> {
    console.log(
        "Attempting to send message to recipients",
        recipients?.map((x) => x.name),
    );
    for (const recipient of recipients) {
        let r = recipient;
        if (!r.matrixAccessToken || !r.matrixNotificationsRoomId) {
            const userDoc = await getPrivateUserByDid(recipient.did!);
            if (!userDoc) continue;
            r = userDoc;
        }

        // If still no matrix credentials or no notifications room, skip.
        if (!r.matrixAccessToken || !r.matrixNotificationsRoomId) {
            continue;
        }

        // Sanitize payload to convert any ObjectId or Date to string
        const sanitizedPayload = {
            circle: payload.circle ? sanitizeCircle(payload.circle) : undefined,
            user: payload.user ? sanitizeCircle(payload.user) : undefined,
            post: payload.post ? sanitizeContent(payload.post) : undefined,
            comment: payload.comment ? sanitizeContent(payload.comment) : undefined,
            reaction: payload.reaction,
            postId: payload.postId?.toString(),
            commentId: payload.commentId?.toString(),
            project: payload.project ? sanitizeCircle(payload.project) : undefined,
            projectId: payload.projectId?.toString(),
        };

        // Build some text fallback and extra custom fields
        const body = deriveBody(notificationType, payload);
        const content = {
            msgtype: "m.text", // required for m.room.message
            body, // fallback text
            notificationType, // e.g. "follow_request"
            ...sanitizedPayload,
        };

        console.log(
            "Sending message to",
            recipients?.map((x) => x.name),
            "content:",
            content,
        );

        await sendMessage(r.matrixAccessToken, r.matrixNotificationsRoomId, content);
    }
}

// Helper functions to sanitize data
function sanitizeContent(obj: any): any {
    if (!obj) return obj;

    const sanitized = { ...obj };
    if (sanitized._id) sanitized._id = sanitized._id.toString();
    if (sanitized.createdAt) sanitized.createdAt = sanitized.createdAt.toISOString();
    if (sanitized.editedAt) sanitized.editedAt = sanitized.editedAt.toISOString();

    return sanitized;
}

function sanitizeCircle(circle: Circle): Partial<Circle> & { createdAt?: string } {
    if (!circle) return circle;

    const sanitized = { ...circle } as any;

    // If there's a location field, convert any numeric lat/lng to strings
    if (sanitized.location?.lngLat) {
        const { lng, lat } = sanitized.location.lngLat;
        // Only do this if they're finite; or default to empty string
        sanitized.location.lngLat.lng = Number.isFinite(lng) ? String(lng) : "";
        sanitized.location.lngLat.lat = Number.isFinite(lat) ? String(lat) : "";
    }

    if (sanitized._id) sanitized._id = sanitized._id.toString();
    if (sanitized.createdAt) {
        const createdAtString = sanitized.createdAt.toISOString();
        delete sanitized.createdAt;
        return { ...sanitized, createdAt: createdAtString } as Partial<Circle> & { createdAt?: string };
    }

    return sanitized as Partial<Circle> & { createdAt?: string };
}

function deriveBody(
    notificationType: NotificationType,
    payload: {
        circle?: Circle;
        user?: Circle;
        post?: Post;
        comment?: Comment;
        reaction?: string;
        project?: Circle;
    },
) {
    switch (notificationType) {
        case "follow_request":
            return `${payload.user?.name} has requested to follow circle ${payload?.circle?.name}`;
        case "new_follower":
            return `${payload.user?.name} has followed circle ${payload?.circle?.name}`;
        case "follow_accepted":
            return `You have been accepted into circle ${payload?.circle?.name}`;
        case "post_comment":
            return `${payload.user?.name} commented on your post`;
        case "comment_reply":
            return `${payload.user?.name} replied to your comment`;
        case "post_like":
            return `${payload.user?.name} liked your post`;
        case "comment_like":
            return `${payload.user?.name} liked your comment`;
        case "post_mention":
            return `${payload.user?.name} mentioned you in a post`;
        case "comment_mention":
            return `${payload.user?.name} mentioned you in a comment`;
        case "project_comment":
            return `${payload.user?.name} commented on your project "${payload.project?.name}"`;
        case "project_comment_reply":
            return `${payload.user?.name} replied to your comment on project "${payload.project?.name}"`;
        case "project_mention":
            return `${payload.user?.name} mentioned you in a comment on project "${payload.project?.name}"`;
        default:
            return "New notification";
    }
}

export async function sendMessage(
    accessToken: string,
    roomId: string,
    content: {
        msgtype: string; // typically "m.text"
        body: string; // the fallback text
        [key: string]: any; // any other custom fields (e.g., notificationType)
    },
): Promise<any> {
    // Use a timestamp or any unique ID for the transaction
    const txnId = `${Date.now()}`;

    // Construct the request URL
    const url = `${MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`;

    console.log("Sending server-side Matrix message to room:", roomId);
    console.log("Message content:", content);

    // Fire off the request
    const response = await fetch(url, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(content),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send message: ${errorText}`);
    }

    return await response.json();
}
