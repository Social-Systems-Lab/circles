// matrix.ts - Matrix chat functionality
import {
    ChatRoom,
    Circle,
    NotificationType,
    UserPrivate,
    Post,
    Comment,
    Proposal,
    ProposalDisplay,
    IssueDisplay,
    IssueStage,
    TaskDisplay, // Added TaskDisplay
    TaskStage,
    GoalStage, // Added TaskStage
    Media, // Added Media
    EntityType, // For notification settings
    DefaultNotificationSetting, // For notification settings
    UserNotificationSetting, // For notification settings
} from "@/models/models";
import crypto from "crypto";
import { getCirclesByDids, updateCircle } from "./circle";
import { getServerSettings, updateServerSettings } from "./server-settings";
import { getPrivateUserByDid, getUser } from "./user";
import { getMembers } from "./member";
import { UserNotificationSettings, DefaultNotificationSettings } from "./db"; // DB collections
// Import checkUserPermissionForNotification - this is a server action.
// We might need to call it or replicate its essential logic if matrix.ts is purely server-side.
// For now, let's assume we can call it or have access to similar permission checking.
// If matrix.ts can call server actions:
import { checkUserPermissionForNotification } from "@/lib/actions/notificationSettings";

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

export async function registerOrLoginMatrixUser(user: UserPrivate, userDid: string): Promise<string> {
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
        await updateCircle(
            {
                _id: user._id,
                matrixUsername: username,
                matrixPassword: password,
            },
            userDid,
        );
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

        await updateCircle(
            {
                _id: user._id,
                matrixAccessToken: access_token,
                matrixNotificationsRoomId: user.matrixNotificationsRoomId,
            },
            userDid,
        );
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
    await updateCircle(
        {
            _id: user._id,
            matrixAccessToken: accessToken,
            matrixNotificationsRoomId: user.matrixNotificationsRoomId,
        },
        userDid,
    );

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
        user?: Circle | undefined; // Allow undefined as corrected in ranking.ts
        post?: Post;
        comment?: Comment;
        reaction?: string;
        postId?: string;
        commentId?: string;
        project?: Circle;
        projectId?: string;
        // Proposal fields
        proposalId?: string;
        proposalName?: string;
        proposalOutcome?: string;
        proposalResolvedAtStage?: string;
        // Issue fields
        issueId?: string;
        issueTitle?: string;
        assigneeName?: string;
        issueOldStage?: IssueStage;
        issueNewStage?: IssueStage;
        // Task fields (mirroring Issue fields)
        taskId?: string;
        taskTitle?: string;
        taskOldStage?: TaskStage;
        taskNewStage?: TaskStage;
        // Goal fields (mirroring Issue fields)
        goalId?: string;
        goalTitle?: string;
        goalOldStage?: GoalStage;
        goalNewStage?: GoalStage;
        messageBody?: string; // For pre-formatted messages like resolution
        // Add index signature to allow other properties for custom notification types
        [key: string]: any;
    },
): Promise<void> {
    console.log(
        "Attempting to send message to recipients",
        recipients?.map((x) => x.name),
    );
    for (const recipient of recipients) {
        let r = recipient; // User object for the recipient
        if (!r.did) {
            console.warn("Recipient has no DID, skipping notification:", r.name);
            continue;
        }

        // Determine entityType and entityId from payload and notificationType
        let currentEntityType: EntityType | undefined = undefined;
        let currentEntityId: string | undefined = undefined;

        if (notificationType.startsWith("post_") || notificationType.startsWith("comment_")) {
            if (payload.postId) {
                currentEntityType = "POST";
                currentEntityId = payload.postId.toString();
                if (notificationType.startsWith("comment_") && payload.commentId) {
                    // For comment-specific notifications, the primary entity might still be the post,
                    // or we could model comments as their own entities for notifications.
                    // Let's assume for now comment notifications are tied to the POST entity context.
                    // If comments were their own entityType for notifications:
                    // currentEntityType = "COMMENT";
                    // currentEntityId = payload.commentId.toString();
                }
            }
        } else if (notificationType.startsWith("proposal_")) {
            currentEntityType = "PROPOSAL";
            currentEntityId = payload.proposalId?.toString();
        } else if (notificationType.startsWith("issue_")) {
            currentEntityType = "ISSUE";
            currentEntityId = payload.issueId?.toString();
        } else if (notificationType.startsWith("task_")) {
            currentEntityType = "TASK";
            currentEntityId = payload.taskId?.toString();
        } else if (notificationType.startsWith("goal_")) {
            currentEntityType = "GOAL";
            currentEntityId = payload.goalId?.toString();
        } else if (notificationType.startsWith("follow_") || notificationType === "new_follower") {
            currentEntityType = "CIRCLE";
            currentEntityId = payload.circle?._id?.toString();
        }
        // Add other mappings as needed, e.g., for "USER" entityType if applicable

        if (!currentEntityType || !currentEntityId) {
            console.warn(
                `Could not determine entityType/Id for notificationType: ${notificationType}. Sending without check.`,
            );
            // Fallback: send notification if entity cannot be determined (old behavior)
        } else {
            let isEnabled = false;
            let isPermitted = false;

            // 1. Check user-specific setting
            const userSetting = await UserNotificationSettings.findOne({
                userId: r.did,
                entityType: currentEntityType,
                entityId: currentEntityId,
                notificationType: notificationType,
            });

            if (userSetting) {
                isEnabled = userSetting.isEnabled;
            } else {
                // 2. Check default setting if no user-specific one
                const defaultSetting = await DefaultNotificationSettings.findOne({
                    entityType: currentEntityType,
                    notificationType: notificationType,
                });
                if (defaultSetting) {
                    isEnabled = defaultSetting.defaultIsEnabled;
                } else {
                    // Fallback: if no default is defined, assume enabled (or choose a stricter default like false)
                    isEnabled = true;
                    console.warn(
                        `No default setting found for ${currentEntityType} - ${notificationType}. Assuming enabled.`,
                    );
                }
            }

            // 3. Verify permission (re-verification step)
            // This uses the `requiredPermission` from the default setting if available.
            const defaultForPermCheck = await DefaultNotificationSettings.findOne({
                entityType: currentEntityType,
                notificationType: notificationType,
            });

            isPermitted = await checkUserPermissionForNotification(
                r.did,
                currentEntityType,
                currentEntityId,
                defaultForPermCheck?.requiredPermission,
            );

            if (!isEnabled || !isPermitted) {
                console.log(
                    `Notification ${notificationType} for ${r.name} on ${currentEntityType}:${currentEntityId} is disabled or not permitted. Skipping.`,
                );
                continue; // Skip sending this notification
            }
        }

        // Proceed with sending if checks pass or if entityType/Id could not be determined (fallback)
        if (!r.matrixAccessToken || !r.matrixNotificationsRoomId) {
            const userDoc = await getPrivateUserByDid(r.did); // r.did should be valid here
            if (!userDoc) {
                console.warn("Could not retrieve full userDoc for recipient, skipping:", r.name);
                continue;
            }
            r = userDoc; // Use the full UserPrivate object
        }

        if (!r.matrixAccessToken || !r.matrixNotificationsRoomId) {
            console.warn("Recipient still missing Matrix credentials or notifications room, skipping:", r.name);
            continue;
        }

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
            // Sanitize proposal fields
            proposalId: payload.proposalId?.toString(),
            proposalName: payload.proposalName,
            proposalOutcome: payload.proposalOutcome,
            proposalResolvedAtStage: payload.proposalResolvedAtStage,
            // Sanitize issue fields
            issueId: payload.issueId?.toString(),
            issueTitle: payload.issueTitle,
            assigneeName: payload.assigneeName,
            issueOldStage: payload.issueOldStage,
            issueNewStage: payload.issueNewStage,
            // Sanitize task fields
            taskId: payload.taskId?.toString(),
            taskTitle: payload.taskTitle,
            taskOldStage: payload.taskOldStage,
            taskNewStage: payload.taskNewStage,
            // Sanitize goal fields
            goalId: payload.goalId?.toString(),
            goalTitle: payload.goalTitle,
            goalOldStage: payload.goalOldStage,
            goalNewStage: payload.goalNewStage,
            messageBody: payload.messageBody,
        };

        // Build some text fallback and extra custom fields
        // Use messageBody if provided, otherwise derive fallback
        const body = payload.messageBody || deriveBody(notificationType, payload);
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

// Helper function to sanitize Media objects (ensure fileInfo is basic)
function sanitizeMedia(media: any): any {
    if (!media || typeof media !== "object") return media;
    const sanitized = { ...media };
    if (sanitized.fileInfo && typeof sanitized.fileInfo === "object") {
        sanitized.fileInfo = {
            url: sanitized.fileInfo.url,
            fileName: sanitized.fileInfo.fileName,
            originalName: sanitized.fileInfo.originalName,
        };
    }
    // Remove other potentially complex fields if necessary
    return sanitized;
}

// Helper functions to sanitize data
function sanitizeContent(obj: any): any {
    if (!obj || typeof obj !== "object") return obj; // Handle null or non-objects

    const sanitized = { ...obj } as any; // Use 'as any' carefully or define a more specific type

    // Sanitize known fields
    if (sanitized._id) sanitized._id = sanitized._id.toString();
    if (sanitized.createdAt instanceof Date) sanitized.createdAt = sanitized.createdAt.toISOString();
    if (sanitized.editedAt instanceof Date) sanitized.editedAt = sanitized.editedAt.toISOString();
    if (typeof sanitized.comments === "number") sanitized.comments = Math.floor(sanitized.comments);
    if (typeof sanitized.replies === "number") sanitized.replies = Math.floor(sanitized.replies);

    // Sanitize reactions object more thoroughly
    if (sanitized.reactions && typeof sanitized.reactions === "object") {
        const sanitizedReactions: { [key: string]: number | string } = {}; // Allow string values too
        for (const key in sanitized.reactions) {
            if (Object.prototype.hasOwnProperty.call(sanitized.reactions, key)) {
                const value = sanitized.reactions[key];
                if (typeof value === "number") {
                    sanitizedReactions[key] = Math.floor(value); // Ensure integer
                } else {
                    sanitizedReactions[key] = String(value); // Convert others to string just in case
                }
            }
        }
        sanitized.reactions = sanitizedReactions;
    }

    // Recursively sanitize nested 'author' object if it exists and is an object
    if (sanitized.author && typeof sanitized.author === "object") {
        // Assuming author structure might be similar to Circle, use sanitizeCircle
        sanitized.author = sanitizeCircle(sanitized.author);
    }

    // Recursively sanitize nested 'parentComment' object if it exists and is an object
    if (sanitized.parentComment && typeof sanitized.parentComment === "object") {
        sanitized.parentComment = sanitizeContent(sanitized.parentComment); // Use sanitizeContent for comments
    }

    // Sanitize media array if present
    if (Array.isArray(sanitized.media)) {
        sanitized.media = sanitized.media.map(sanitizeMedia); // Use sanitizeMedia helper
    }

    // Remove potentially sensitive or problematic fields before sending to Matrix
    delete sanitized.password; // Example if password was ever included
    delete sanitized.matrixAccessToken;
    delete sanitized.matrixPassword;
    delete sanitized.parentItem; // Remove potentially large/complex nested object if not needed directly by Matrix
    // delete sanitized.accessRules; // Consider if this large object is needed

    return sanitized;
}

function sanitizeProposal(proposal: Proposal | ProposalDisplay): any {
    if (!proposal) return proposal;

    const sanitized = { ...proposal } as any;
    if (sanitized.location?.lgnLat) {
        const { lng, lat } = sanitized.location.lngLat;
        // Only do this if they're finite; or default to empty string
        sanitized.location.lngLat.lng = Number.isFinite(lng) ? String(lng) : "";
        sanitized.location.lngLat.lat = Number.isFinite(lat) ? String(lat) : "";
    }

    if (sanitized._id) sanitized._id = sanitized._id.toString();
    if (sanitized.createdAt) {
        const createdAtString = sanitized.createdAt.toISOString();
        sanitized.createdAt = createdAtString;
    }
    if (sanitized.author) {
        sanitized.author = sanitizeCircle(sanitized.author);
    }
    if (sanitized.circle) {
        sanitized.circle = sanitizeCircle(sanitized.circle);
    }
    if (sanitized.votingDeadline) {
        sanitized.votingDeadline = sanitized.votingDeadline.toISOString();
    }
    if (sanitized.editedAt) {
        sanitized.editedAt = sanitized.editedAt.toISOString();
    }
    return sanitized;
}

function sanitizeCircle(circle: Circle): Partial<Circle> & { createdAt?: string } {
    if (!circle) return circle;

    const sanitized = { ...circle } as any;

    // If there's a location field, ensure lat/lng are strings or integers if possible
    if (sanitized.location?.lngLat) {
        const { lng, lat } = sanitized.location.lngLat;
        // Convert finite numbers to strings, otherwise keep as is (might be null/undefined)
        if (Number.isFinite(lng)) sanitized.location.lngLat.lng = String(lng);
        if (Number.isFinite(lat)) sanitized.location.lngLat.lat = String(lat);
    }
    // Ensure members count is an integer
    if (typeof sanitized.members === "number") sanitized.members = Math.floor(sanitized.members); // Use floor

    if (sanitized._id) sanitized._id = sanitized._id.toString();
    // Ensure createdAt is converted only if it's a Date object
    if (sanitized.createdAt instanceof Date) {
        sanitized.createdAt = sanitized.createdAt.toISOString();
    }

    // Sanitize images array if present
    if (Array.isArray(sanitized.images)) {
        sanitized.images = sanitized.images.map(sanitizeMedia); // Use sanitizeMedia helper
    }

    // Remove potentially sensitive or problematic fields before sending to Matrix
    delete sanitized.password;
    delete sanitized.matrixAccessToken;
    delete sanitized.matrixPassword;
    delete sanitized.accessRules; // Often large and unnecessary for notifications
    delete sanitized.userGroups; // Often large and unnecessary for notifications
    delete sanitized.questionnaire;

    return sanitized as Partial<Circle> & { createdAt?: string }; // Adjust return type if needed
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
        // Proposal fields for fallback text generation
        proposal?: Proposal | ProposalDisplay;
        proposalName?: string;
        // Issue fields for fallback text generation
        issueTitle?: string;
        assigneeName?: string; // Added missing assigneeName here
        issueOldStage?: IssueStage;
        issueNewStage?: IssueStage;
        // Task fields for fallback text generation
        taskTitle?: string;
        taskOldStage?: TaskStage;
        taskNewStage?: TaskStage;
        // Task fields for fallback text generation
        goalTitle?: string;
        goalOldStage?: TaskStage;
        goalNewStage?: TaskStage;
    },
): string {
    const userName = payload.user?.name || "Someone";
    const circleName = payload.circle?.name || "a circle";
    const proposalName = payload.proposalName || "a proposal";
    const issueTitle = payload.issueTitle || "an issue";
    const assigneeName = payload.assigneeName || "someone";
    const oldIssueStage = payload.issueOldStage || "previous stage";
    const newIssueStage = payload.issueNewStage || "new stage";

    const taskTitle = payload.taskTitle || "a task"; // Use provided title or fallback
    const oldTaskStage = payload.taskOldStage || "previous stage";
    const newTaskStage = payload.taskNewStage || "new stage";

    const goalTitle = payload.goalTitle || "a goal"; // Use provided title or fallback
    const oldGoalStage = payload.goalOldStage || "previous stage";
    const newGoalStage = payload.goalNewStage || "new stage";

    switch (notificationType) {
        case "follow_request":
            return `${userName} has requested to follow circle ${circleName}`;
        case "new_follower":
            return `${userName} has followed circle ${circleName}`;
        case "follow_accepted":
            return `You have been accepted into circle ${circleName}`;
        case "post_comment":
            // Check if it's a comment on a parent item (Goal, Task, etc.)
            if (payload.post?.parentItemType) {
                const itemType = payload.post.parentItemType;
                // Access the specific title field directly from the payload
                const itemTitle =
                    payload.goalTitle ||
                    payload.taskTitle ||
                    payload.issueTitle ||
                    payload.proposalName || // Use proposalName for proposals
                    `a ${itemType}`;
                // TODO: Add specific message for assignee if needed
                return `${userName} commented on the ${itemType}: "${itemTitle}"`;
            }
            return `${userName} commented on your post`; // Fallback for regular posts
        case "comment_reply":
            // Check if it's a reply on a parent item's comment thread
            if (payload.post?.parentItemType) {
                const itemType = payload.post.parentItemType;
                const itemTitle =
                    payload.goalTitle ||
                    payload.taskTitle ||
                    payload.issueTitle ||
                    payload.proposalName || // Use proposalName for proposals
                    `a ${itemType}`;
                // TODO: Add specific message for assignee if needed
                return `${userName} replied to a comment on the ${itemType}: "${itemTitle}"`;
            }
            return `${userName} replied to your comment`; // Fallback for regular posts
        case "post_like":
            // Check if it's a like on a parent item's shadow post
            if (payload.post?.parentItemType) {
                const itemType = payload.post.parentItemType;
                const itemTitle =
                    payload.goalTitle ||
                    payload.taskTitle ||
                    payload.issueTitle ||
                    payload.proposalName || // Use proposalName for proposals
                    `a ${itemType}`;
                return `${userName} liked the ${itemType}: "${itemTitle}"`;
            }
            return `${userName} liked your post`; // Fallback for regular posts
        case "comment_like":
            // Check if it's a like on a parent item's comment
            if (payload.post?.parentItemType) {
                const itemType = payload.post.parentItemType;
                const itemTitle =
                    payload.goalTitle ||
                    payload.taskTitle ||
                    payload.issueTitle ||
                    payload.proposalName || // Use proposalName for proposals
                    `a ${itemType}`;
                return `${userName} liked a comment on the ${itemType}: "${itemTitle}"`;
            }
            return `${userName} liked your comment`; // Fallback for regular posts
        case "post_mention":
            // Check if it's a mention in a parent item's shadow post
            if (payload.post?.parentItemType) {
                const itemType = payload.post.parentItemType;
                const itemTitle =
                    payload.goalTitle ||
                    payload.taskTitle ||
                    payload.issueTitle ||
                    payload.proposalName || // Use proposalName for proposals
                    `a ${itemType}`;
                return `${userName} mentioned you in the ${itemType}: "${itemTitle}"`;
            }
            return `${userName} mentioned you in a post`; // Fallback for regular posts
        case "comment_mention":
            // Check if it's a mention in a parent item's comment
            if (payload.post?.parentItemType) {
                const itemType = payload.post.parentItemType;
                const itemTitle =
                    payload.goalTitle ||
                    payload.taskTitle ||
                    payload.issueTitle ||
                    payload.proposalName || // Use proposalName for proposals
                    `a ${itemType}`;
                return `${userName} mentioned you in a comment on the ${itemType}: "${itemTitle}"`;
            }
            return `${userName} mentioned you in a comment`; // Fallback for regular posts
        // Proposal Notifications Fallbacks
        case "proposal_submitted_for_review":
            return `${userName} submitted proposal "${proposalName}" for review in ${circleName}`;
        case "proposal_moved_to_voting":
            return `Proposal "${proposalName}" in ${circleName} is now open for voting`;
        case "proposal_approved_for_voting":
            return `Your proposal "${proposalName}" in ${circleName} has been approved for voting`;
        case "proposal_resolved": // Fallback, specific message should be in messageBody
            return `Your proposal "${proposalName}" in ${circleName} has been resolved`;
        case "proposal_resolved_voter": // Fallback, specific message should be in messageBody
            return `Proposal "${proposalName}" in ${circleName} has been resolved`;
        case "proposal_vote":
            return `${userName} voted on your proposal "${proposalName}" in ${circleName}`;
        // Issue Notifications Fallbacks
        case "issue_submitted_for_review":
            return `${userName} submitted issue "${issueTitle}" for review in ${circleName}`;
        case "issue_approved":
            return `Your issue "${issueTitle}" in ${circleName} was approved and is now Open`;
        case "issue_assigned":
            return `${userName} assigned issue "${issueTitle}" to you in ${circleName}`;
        case "issue_status_changed":
            return `Issue "${issueTitle}" in ${circleName} changed status from ${oldIssueStage} to ${newIssueStage}`;
        // Task Notifications Fallbacks
        case "task_submitted_for_review":
            return `${userName} submitted task "${taskTitle}" for review in ${circleName}`;
        case "task_approved":
            return `Your task "${taskTitle}" in ${circleName} was approved and is now Open`;
        case "task_assigned":
            return `${userName} assigned task "${taskTitle}" to you in ${circleName}`;
        case "task_status_changed":
            return `Task "${taskTitle}" in ${circleName} changed status from ${oldTaskStage} to ${newTaskStage}`;
        // Goal Notifications Fallbacks
        case "goal_submitted_for_review":
            return `${userName} submitted goal "${goalTitle}" for review in ${circleName}`;
        case "goal_approved":
            return `Your goal "${goalTitle}" in ${circleName} was approved and is now Open`;
        case "goal_status_changed":
            return `Goal "${goalTitle}" in ${circleName} changed status from ${oldGoalStage} to ${newGoalStage}`;
        // Ranking Notifications Fallbacks
        case "ranking_stale_reminder":
            // Note: The actual message is usually pre-formatted in payload.messageBody
            return `You have new items to rank in ${circleName}.`;
        case "ranking_grace_period_ended":
            // Note: The actual message is usually pre-formatted in payload.messageBody
            return `Your ranking in ${circleName} is no longer being counted.`;
        default:
            // Ensure exhaustive check or provide a generic default
            const exhaustiveCheck: never = notificationType;
            console.warn(`Unhandled notification type in deriveBody: ${exhaustiveCheck}`);
            return "Unknown notification";
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
