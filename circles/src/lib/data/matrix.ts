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
    TaskDisplay,
    TaskStage,
    GoalStage,
    Media,
    EntityType,
    DefaultNotificationSetting,
    UserNotificationSetting,
    Notification,
} from "@/models/models";
import crypto from "crypto";
import { getCirclesByDids, updateCircle } from "./circle";
import { getServerSettings, updateServerSettings } from "./server-settings";
import { getPrivateUserByDid, getUser } from "./user";
import { getMembers } from "./member";
import { UserNotificationSettings, DefaultNotificationSettings, Notifications } from "./db";
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

    const checkUserResponse = await fetch(`${MATRIX_URL}/_synapse/admin/v1/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${MATRIX_SHARED_SECRET}` },
        body: JSON.stringify({ username: adminUsername, password: adminPassword, admin: true, nonce, mac }),
    });

    const responseJson = await checkUserResponse.json();

    if (responseJson.errcode === "M_USER_IN_USE") {
        const loginResponse = await fetch(`${MATRIX_URL}/_matrix/client/v3/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "m.login.password", user: adminUsername, password: adminPassword }),
        });
        if (!loginResponse.ok) throw new Error("Admin user login failed");
        const loginData = await loginResponse.json();
        serverSettings.matrixAdminAccessToken = loginData.access_token;
        await updateServerSettings(serverSettings);
        return loginData.access_token;
    }

    if (!checkUserResponse.ok) throw new Error(`Failed to create admin user: ${responseJson.error}`);

    const loginResponseAfterCreate = await fetch(`${MATRIX_URL}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "m.login.password", user: adminUsername, password: adminPassword }),
    });

    if (!loginResponseAfterCreate.ok) throw new Error("Admin user login failed after creation");
    const loginDataAfterCreate = await loginResponseAfterCreate.json();
    serverSettings.matrixAdminAccessToken = loginDataAfterCreate.access_token;
    await updateServerSettings(serverSettings);
    return loginDataAfterCreate.access_token;
}

export async function registerOrLoginMatrixUser(user: UserPrivate, userDid: string): Promise<string> {
    let username = user.matrixUsername;
    let password = user.matrixPassword;

    if (!username) {
        if (!user.handle) {
            console.error(
                `User ${user._id || user.did} is missing a handle. Cannot generate Matrix username from handle.`,
            );
            throw new Error(`User ${user._id || user.did} is missing a handle for Matrix username generation.`);
        }
        username = user.handle.toLowerCase();
        password = crypto.randomBytes(16).toString("hex");
        user.matrixUsername = username;
        user.matrixPassword = password;
        while (await checkIfMatrixUserExists(username)) {
            username += Math.floor(Math.random() * 10);
        }
        user.matrixUsername = username;
        user.fullMatrixName = `@${username}:${MATRIX_DOMAIN}`;

        // Persist only Circle fields initially. UserPrivate specific fields like fullMatrixName are set on the in-memory 'user' object.
        // If updateCircle is strictly Partial<Circle>, fullMatrixName should not be here.
        // If updateCircle can handle Partial<UserPrivate>, it could be included.
        // For safety, only include base Circle fields here.
        await updateCircle(
            { _id: user._id, matrixUsername: user.matrixUsername, matrixPassword: user.matrixPassword },
            userDid,
        );
        // If fullMatrixName needs to be persisted, a separate update or an enhanced updateCircle is required.
    }

    let adminAccessToken = await getAdminAccessToken();
    const checkUserResponse = await fetch(`${MATRIX_URL}/_synapse/admin/v2/users/@${username}:${MATRIX_DOMAIN}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${adminAccessToken}` },
    });

    if (checkUserResponse.ok) {
        let access_token = await loginMatrixUser(username, password!);
        user.matrixAccessToken = access_token;
        if (!user.matrixNotificationsRoomId) {
            user.matrixNotificationsRoomId = await addUserNotificationsRoom(user);
        }
        // These fields are on Circle, so this update is fine.
        await updateCircle(
            {
                _id: user._id,
                matrixAccessToken: user.matrixAccessToken,
                matrixNotificationsRoomId: user.matrixNotificationsRoomId,
            },
            userDid,
        );
        return access_token;
    }

    const registerResponse = await fetch(`${MATRIX_URL}/_synapse/admin/v2/users/@${username}:${MATRIX_DOMAIN}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminAccessToken}` },
        body: JSON.stringify({ password, admin: false, displayname: user.name }),
    });

    if (!registerResponse.ok) throw new Error(`Matrix registration failed: ${await registerResponse.text()}`);

    const accessToken = await loginMatrixUser(username, password!);
    user.matrixAccessToken = accessToken;
    user.matrixNotificationsRoomId = await addUserNotificationsRoom(user);
    await updateCircle(
        {
            _id: user._id,
            matrixAccessToken: user.matrixAccessToken,
            matrixNotificationsRoomId: user.matrixNotificationsRoomId,
        },
        userDid,
    );
    return accessToken;
}

export async function checkIfMatrixUserExists(username: string): Promise<boolean> {
    let adminAccessToken = await getAdminAccessToken();
    const response = await fetch(`${MATRIX_URL}/_synapse/admin/v2/users/@${username}:${MATRIX_DOMAIN}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${adminAccessToken}` },
    });
    return response.ok;
}

// Wrapper function for sending messages from server actions
export async function sendMatrixMessage(
    accessToken: string,
    roomId: string,
    content: string,
    replyToEventId?: string
): Promise<{ event_id: string }> {
    const txnId = Date.now();
    const messageContent: any = {
        msgtype: "m.text",
        body: content,
    };

    if (replyToEventId) {
        messageContent["m.relates_to"] = {
            "m.in_reply_to": {
                event_id: replyToEventId,
            },
        };
    }

    const response = await fetch(
        `${MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
        {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(messageContent),
        },
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send message: ${response.status} ${errorText}`);
    }

    return await response.json();
}

// Fetch messages from a room (server-side)
export async function fetchRoomMessages(
    accessToken: string,
    roomId: string,
    limit: number = 50
): Promise<any[]> {
    const response = await fetch(
        `${MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=${limit}`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        },
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch messages: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.chunk || [];
}



export async function loginMatrixUser(username: string, password: string): Promise<string> {
    const response = await fetch(`${MATRIX_URL}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "m.login.password", user: username, password }),
    });
    if (!response.ok) throw new Error(`Matrix login failed: ${await response.text()}`);
    const { access_token } = await response.json();
    return access_token;
}

export async function addUserToRoom(accessToken: string, roomId: string): Promise<void> {
    const response = await fetch(`${MATRIX_URL}/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error(`Failed to add user to room ${roomId}: ${await response.text()}`);
}

async function getUserNotificationsRoom(user: UserPrivate): Promise<string> {
    let adminAccessToken = await getAdminAccessToken();
    let notificationsRoomId = `${user._id!.toString()}-notification`;
    const aliasWithHash = `#${notificationsRoomId}:${MATRIX_DOMAIN}`;
    try {
        const response = await fetch(
            `${MATRIX_URL}/_matrix/client/v3/directory/room/${encodeURIComponent(aliasWithHash)}`,
            { method: "GET", headers: { Authorization: `Bearer ${adminAccessToken}` } },
        );
        if (response.ok) return (await response.json()).room_id;
    } catch (error) {
        /* Will create below */
    }

    const createResponse = await fetch(`${MATRIX_URL}/_matrix/client/v3/createRoom`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "User Notifications",
            room_alias_name: notificationsRoomId,
            visibility: "public",
            preset: "public_chat",
        }),
    });
    if (!createResponse.ok) throw new Error("Failed to create user notifications chat room");
    return (await createResponse.json()).room_id;
}

export async function addUserNotificationsRoom(user: UserPrivate): Promise<string> {
    const roomId = await getUserNotificationsRoom(user);
    if (user.matrixAccessToken) {
        await addUserToRoom(user.matrixAccessToken, roomId);
    } else {
        console.warn(`User ${user.name} missing matrixAccessToken, cannot add to notifications room.`);
    }
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
        headers: { Authorization: `Bearer ${adminAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, room_alias_name: alias, topic, visibility: "public", preset: "public_chat" }),
    });
    if (!response.ok) return { roomId: undefined };
    return { roomId: (await response.json()).room_id };
}

async function generateNonce(): Promise<string> {
    const response = await fetch(`${MATRIX_URL}/_synapse/admin/v1/register`, {
        method: "GET",
        headers: { Authorization: `Bearer ${MATRIX_SHARED_SECRET}` },
    });
    if (!response.ok) throw new Error("Failed to get nonce");
    const data = await response.json();
    return data.nonce;
}
function generateMac(nonce: string, username: string, password: string, isAdmin: boolean): string {
    const data = `${nonce}\0${username}\0${password}\0${isAdmin ? "admin" : "notadmin"}`;
    return crypto.createHmac("sha1", MATRIX_SHARED_SECRET).update(data).digest("hex");
}
export async function removeUserFromRoom(userId: string, roomId: string): Promise<void> {
    const adminAccessToken = await getAdminAccessToken();
    const url = `${MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`;
    const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, reason: "Leaving circle" }),
    });
    if (!response.ok) throw new Error(`Failed removing user: ${await response.text()}`);
}
export async function updateMatrixRoomNameAndAvatar(roomId: string, newName: string, avatarUrl?: string) {
    const adminAccessToken = await getAdminAccessToken();
    await fetch(`${MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${adminAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
    }).then((res) => {
        if (!res.ok) throw new Error(`Failed updating room name: ${res.statusText}`);
    });

    if (avatarUrl) {
        await fetch(`${MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.avatar`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${adminAccessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ url: avatarUrl }),
        }).then((res) => {
            if (!res.ok) throw new Error(`Failed updating room avatar: ${res.statusText}`);
        });
    }
}

export async function notifyNewMember(userDid: string, circle: Circle, omitFollowAccepted?: boolean) {
    const newMemberUser = await getPrivateUserByDid(userDid);
    if (!newMemberUser) {
        console.warn(`notifyNewMember: Could not find user with DID ${userDid}`);
        return;
    }
    const members = await getMembers(circle._id!);
    const otherMembersIds = members.filter((member) => member.userDid !== userDid).map((x) => x.userDid);
    let validRecipients: UserPrivate[] = [];
    if (otherMembersIds.length > 0) {
        for (const did of otherMembersIds) {
            const userPriv = await getPrivateUserByDid(did);
            if (userPriv) {
                // Cast to UserPrivate, assuming getPrivateUserByDid should provide a compatible object
                validRecipients.push(userPriv as UserPrivate);
            }
        }
    }

    if (circle.circleType !== "user" && validRecipients.length > 0) {
        // Cast newMemberUser for the payload, assuming it should be UserPrivate
        await sendNotifications("new_follower", validRecipients, { circle, user: newMemberUser as UserPrivate });
    }
    if (!omitFollowAccepted) {
        // Cast newMemberUser for recipients array and payload, assuming it should be UserPrivate
        await sendNotifications("follow_accepted", [newMemberUser as UserPrivate], {
            circle,
            user: newMemberUser as UserPrivate,
        });
    }
}

export async function sendNotifications(
    notificationType: NotificationType,
    recipients: UserPrivate[],
    payload: { [key: string]: any },
): Promise<void> {
    for (const recipientDoc of recipients) {
        if (!recipientDoc.did) {
            console.warn("Recipient has no DID, skipping notification:", recipientDoc.name);
            continue;
        }

        if (
            recipientDoc.notificationPauseConfig?.allUntil &&
            new Date(recipientDoc.notificationPauseConfig.allUntil) > new Date()
        ) {
            console.log(`Notifications globally paused for ${recipientDoc.name}. Skipping.`);
            continue;
        }

        let currentEntityType: EntityType | undefined = undefined;
        let currentEntityId: string | undefined = undefined;
        let categoryKey: string | undefined = undefined;

        if (notificationType.startsWith("post_") || notificationType.startsWith("comment_")) {
            categoryKey = "post";
            if (payload.postId) {
                currentEntityType = "POST";
                currentEntityId = payload.postId.toString();
            }
        } else if (notificationType.startsWith("proposal_")) {
            categoryKey = "proposal";
            if (payload.proposalId) {
                currentEntityType = "PROPOSAL";
                currentEntityId = payload.proposalId.toString();
            }
        } else if (notificationType.startsWith("issue_")) {
            categoryKey = "issue";
            if (payload.issueId) {
                currentEntityType = "ISSUE";
                currentEntityId = payload.issueId.toString();
            }
        } else if (notificationType.startsWith("task_")) {
            categoryKey = "task";
            if (payload.taskId) {
                currentEntityType = "TASK";
                currentEntityId = payload.taskId.toString();
            }
        } else if (notificationType.startsWith("goal_")) {
            categoryKey = "goal";
            if (payload.goalId) {
                currentEntityType = "GOAL";
                currentEntityId = payload.goalId.toString();
            }
        } else if (notificationType.startsWith("follow_") || notificationType === "new_follower") {
            categoryKey = "circle";
            if (payload.circle?._id) {
                currentEntityType = "CIRCLE";
                currentEntityId = payload.circle._id.toString();
            }
        }

        if (
            categoryKey &&
            recipientDoc.notificationPauseConfig?.categoryUntil?.[categoryKey] &&
            new Date(recipientDoc.notificationPauseConfig.categoryUntil[categoryKey]) > new Date()
        ) {
            console.log(`Notifications for category '${categoryKey}' paused for ${recipientDoc.name}. Skipping.`);
            continue;
        }

        if (!currentEntityType || !currentEntityId) {
            console.warn(
                `Could not determine entityType/Id for ${notificationType}. Pause/preference check might be incomplete.`,
            );
        } else {
            const userSetting = await UserNotificationSettings.findOne({
                userId: recipientDoc.did,
                entityType: currentEntityType,
                entityId: currentEntityId,
                notificationType: notificationType,
            });

            if (userSetting?.pausedUntil && new Date(userSetting.pausedUntil) > new Date()) {
                console.log(
                    `Notification type ${notificationType} for ${currentEntityType}:${currentEntityId} individually paused for ${recipientDoc.name}. Skipping.`,
                );
                continue;
            }

            let isEnabled = userSetting ? userSetting.isEnabled : undefined;
            if (isEnabled === undefined) {
                const defaultSetting = await DefaultNotificationSettings.findOne({
                    entityType: currentEntityType,
                    notificationType,
                });
                isEnabled = defaultSetting ? defaultSetting.defaultIsEnabled : true;
            }

            const defaultForPermCheck = await DefaultNotificationSettings.findOne({
                entityType: currentEntityType,
                notificationType,
            });
            const isPermitted = await checkUserPermissionForNotification(
                recipientDoc.did,
                currentEntityType,
                currentEntityId,
                defaultForPermCheck?.requiredPermission,
            );

            if (!isEnabled || !isPermitted) {
                console.log(
                    `Notification ${notificationType} for ${recipientDoc.name} on ${currentEntityType}:${currentEntityId} is disabled or not permitted. Skipping.`,
                );
                continue;
            }
        }

        if (!recipientDoc.matrixAccessToken || !recipientDoc.matrixNotificationsRoomId) {
            console.warn(`Recipient ${recipientDoc.name} missing Matrix credentials or notifications room, skipping.`);
            continue;
        }

        const body = payload.messageBody || deriveBody(notificationType, payload);
        const content = { msgtype: "m.text", body, notificationType, ...sanitizeObject(payload) };

        await sendMessage(recipientDoc.matrixAccessToken, recipientDoc.matrixNotificationsRoomId, content);

        // Persist the notification to the database
        const notification: Notification = {
            userId: recipientDoc.did,
            type: notificationType,
            content: content,
            isRead: false,
            createdAt: new Date(),
        };
        await Notifications.insertOne(notification);
    }
}

function sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
    }

    if (typeof obj === "object" && obj.constructor === Object) {
        const newObj: { [key: string]: any } = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = sanitizeObject(obj[key]);
            }
        }
        return newObj;
    }

    if (obj._id && typeof obj._id !== "string") {
        return { ...obj, _id: obj._id.toString() };
    }

    if (typeof obj === "number") {
        return String(obj);
    }

    if (obj instanceof Date) {
        return obj.toISOString();
    }

    return obj;
}

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
    return sanitized;
}

function sanitizeContent(obj: any): any {
    return sanitizeObject(obj);
}

function sanitizeCircle(circle: Circle): Partial<Circle> & { createdAt?: string } {
    if (!circle) return circle;
    const sanitized = { ...circle } as any;
    if (sanitized.location?.lngLat) {
        const { lng, lat } = sanitized.location.lngLat;
        if (Number.isFinite(lng)) sanitized.location.lngLat.lng = String(lng);
        if (Number.isFinite(lat)) sanitized.location.lngLat.lat = String(lat);
    }
    if (typeof sanitized.members === "number") sanitized.members = Math.floor(sanitized.members);
    if (sanitized._id) sanitized._id = sanitized._id.toString();
    if (sanitized.createdAt instanceof Date) {
        sanitized.createdAt = sanitized.createdAt.toISOString();
    }
    if (Array.isArray(sanitized.images)) {
        sanitized.images = sanitized.images.map(sanitizeMedia);
    }
    delete sanitized.password;
    delete sanitized.matrixAccessToken;
    delete sanitized.matrixPassword;
    delete sanitized.accessRules;
    delete sanitized.userGroups;
    delete sanitized.questionnaire;
    return sanitized as Partial<Circle> & { createdAt?: string };
}

function deriveBody(notificationType: NotificationType, payload: { [key: string]: any }): string {
    const userName = payload.user?.name || "Someone";
    const circleName = payload.circle?.name || "a circle";
    const proposalName = payload.proposalName || "a proposal";
    const issueTitle = payload.issueTitle || "an issue";
    const assigneeName = payload.assigneeName || "someone";
    const oldIssueStage = payload.issueOldStage || "previous stage";
    const newIssueStage = payload.issueNewStage || "new stage";
    const taskTitle = payload.taskTitle || "a task";
    const oldTaskStage = payload.taskOldStage || "previous stage";
    const newTaskStage = payload.taskNewStage || "new stage";
    const goalTitle = payload.goalTitle || "a goal";
    const oldGoalStage = payload.goalOldStage || "previous stage";
    const newGoalStage = payload.goalNewStage || "new stage";
    const eventName = payload.eventName || "an event";

    switch (notificationType) {
        case "follow_request":
            return `${userName} has requested to follow circle ${circleName}`;
        case "new_follower":
            return `${userName} has followed circle ${circleName}`;
        case "follow_accepted":
            return `You have been accepted into circle ${circleName}`;
        case "post_comment":
            if (payload.post?.parentItemType) {
                const itemType = payload.post.parentItemType;
                const itemTitle =
                    payload.goalTitle ||
                    payload.taskTitle ||
                    payload.issueTitle ||
                    payload.proposalName ||
                    `a ${itemType}`;
                return `${userName} commented on the ${itemType}: "${itemTitle}"`;
            }
            return `${userName} commented on your noticeboard post`;
        case "comment_reply":
            if (payload.post?.parentItemType) {
                const itemType = payload.post.parentItemType;
                const itemTitle =
                    payload.goalTitle ||
                    payload.taskTitle ||
                    payload.issueTitle ||
                    payload.proposalName ||
                    `a ${itemType}`;
                return `${userName} replied to a comment on the ${itemType}: "${itemTitle}"`;
            }
            return `${userName} replied to your comment`;
        case "post_like":
            if (payload.post?.parentItemType) {
                const itemType = payload.post.parentItemType;
                const itemTitle =
                    payload.goalTitle ||
                    payload.taskTitle ||
                    payload.issueTitle ||
                    payload.proposalName ||
                    `a ${itemType}`;
                return `${userName} liked the ${itemType}: "${itemTitle}"`;
            }
            return `${userName} liked your noticeboard post`;
        case "comment_like":
            if (payload.post?.parentItemType) {
                const itemType = payload.post.parentItemType;
                const itemTitle =
                    payload.goalTitle ||
                    payload.taskTitle ||
                    payload.issueTitle ||
                    payload.proposalName ||
                    `a ${itemType}`;
                return `${userName} liked a comment on the ${itemType}: "${itemTitle}"`;
            }
            return `${userName} liked your comment`;
        case "post_mention":
            if (payload.post?.parentItemType) {
                const itemType = payload.post.parentItemType;
                const itemTitle =
                    payload.goalTitle ||
                    payload.taskTitle ||
                    payload.issueTitle ||
                    payload.proposalName ||
                    `a ${itemType}`;
                return `${userName} mentioned you in the ${itemType}: "${itemTitle}"`;
            }
            return `${userName} mentioned you in a noticeboard post`;
        case "comment_mention":
            if (payload.post?.parentItemType) {
                const itemType = payload.post.parentItemType;
                const itemTitle =
                    payload.goalTitle ||
                    payload.taskTitle ||
                    payload.issueTitle ||
                    payload.proposalName ||
                    `a ${itemType}`;
                return `${userName} mentioned you in a comment on the ${itemType}: "${itemTitle}"`;
            }
            return `${userName} mentioned you in a comment`;
        case "proposal_submitted_for_review":
            return `${userName} submitted proposal "${proposalName}" for review in ${circleName}`;
        case "proposal_moved_to_voting":
            return `Proposal "${proposalName}" in ${circleName} is now open for voting`;
        case "proposal_approved_for_voting":
            return `Your proposal "${proposalName}" in ${circleName} has been approved for voting`;
        case "proposal_resolved":
            return `Your proposal "${proposalName}" in ${circleName} has been resolved`;
        case "proposal_resolved_voter":
            return `Proposal "${proposalName}" in ${circleName} has been resolved`;
        case "proposal_vote":
            return `${userName} voted on your proposal "${proposalName}" in ${circleName}`;
        case "issue_submitted_for_review":
            return `${userName} submitted issue "${issueTitle}" for review in ${circleName}`;
        case "issue_approved":
            return `Your issue "${issueTitle}" in ${circleName} was approved and is now Open`;
        case "issue_assigned":
            return `${userName} assigned issue "${issueTitle}" to you in ${circleName}`;
        case "issue_status_changed":
            return `Issue "${issueTitle}" in ${circleName} changed status from ${oldIssueStage} to ${newIssueStage}`;
        case "task_submitted_for_review":
            return `${userName} submitted task "${taskTitle}" for review in ${circleName}`;
        case "task_approved":
            return `Your task "${taskTitle}" in ${circleName} was approved and is now Open`;
        case "task_assigned":
            return `${userName} assigned task "${taskTitle}" to you in ${circleName}`;
        case "task_status_changed":
            return `Task "${taskTitle}" in ${circleName} changed status from ${oldTaskStage} to ${newTaskStage}`;
        case "goal_submitted_for_review":
            return `${userName} submitted goal "${goalTitle}" for review in ${circleName}`;
        case "goal_approved":
            return `Your goal "${goalTitle}" in ${circleName} was approved and is now Open`;
        case "goal_status_changed":
            return `Goal "${goalTitle}" in ${circleName} changed status from ${oldGoalStage} to ${newGoalStage}`;
        case "event_invitation":
            return `${userName} invited you to the event "${eventName}" in ${circleName}`;
        case "ranking_stale_reminder":
            return `You have new items to rank in ${circleName}.`;
        case "ranking_grace_period_ended":
            return `Your ranking in ${circleName} is no longer being counted.`;
        case "user_verified":
            return `Congratulations! Your account has been verified.`;
        default:
            const exhaustiveCheck = notificationType;
            console.warn(`Unhandled notification type in deriveBody: ${exhaustiveCheck}`);
            return "Unknown notification";
    }
}

export async function sendMessage(
    accessToken: string,
    roomId: string,
    content: { msgtype: string; body: string; [key: string]: any },
    isPM: boolean = false,
    recipientDid?: string,
): Promise<any> {
    const txnId = `${Date.now()}`;
    const url = `${MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`;
    const response = await fetch(url, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(content),
    });
    if (!response.ok) throw new Error(`Failed to send message: ${await response.text()}`);

    if (isPM && recipientDid) {
        const notification: Notification = {
            userId: recipientDid,
            type: "pm_received",
            content: content,
            isRead: false,
            createdAt: new Date(),
        };
        await Notifications.insertOne(notification);
    }

    return await response.json();
}

export async function uploadMatrixMedia(
    accessToken: string,
    fileBuffer: Buffer,
    contentType: string,
    fileName: string
): Promise<string> {
    const url = `${MATRIX_URL}/_matrix/media/v3/upload?filename=${encodeURIComponent(fileName)}`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": contentType,
        },
        body: fileBuffer as any,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload media: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.content_uri;
}

export async function sendMatrixAttachment(
    accessToken: string,
    roomId: string,
    mxcUrl: string,
    fileInfo: { name: string; size: number; mimetype: string },
    msgtype: "m.image" | "m.file",
    replyToEventId?: string
): Promise<{ event_id: string }> {
    const txnId = Date.now();
    const content: any = {
        msgtype: msgtype,
        body: fileInfo.name,
        url: mxcUrl,
        info: {
            mimetype: fileInfo.mimetype,
            size: fileInfo.size,
        },
    };

    if (replyToEventId) {
        content["m.relates_to"] = {
            "m.in_reply_to": {
                event_id: replyToEventId,
            },
        };
    }

    const response = await fetch(
        `${MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
        {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(content),
        },
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send attachment: ${response.status} ${errorText}`);
    }

    return await response.json();
}
