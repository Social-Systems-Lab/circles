// client-matrix.ts - helper functions for interacting with the Matrix API
import { UserPrivate } from "@/models/models";

export interface MatrixEvent {
    event_id: string;
    type: string;
    sender: string;
    content: any;
    origin_server_ts: number;
    unsigned?: any;
    state_key?: string;
}

export interface RoomData {
    timeline: {
        events: MatrixEvent[];
    };
    unread_notifications?: {
        highlight_count?: number;
        notification_count?: number;
    };
    ephemeral?: {
        events: MatrixEvent[];
    };
}

export interface SyncResponse {
    rooms?: {
        join?: Record<string, RoomData>;
    };
    next_batch?: string;
}

export async function fetchJoinedRooms(accessToken: string, user: UserPrivate) {
    // console.log(`Fetching joined rooms at ${MATRIX_URL}/client/v3/joined_rooms`);
    const matrixUrl = user.matrixUrl;
    const response = await fetch(`${matrixUrl}/client/v3/joined_rooms`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error("Failed to fetch joined rooms");
    }

    const data = await response.json();
    return data.joined_rooms; // Returns array of room IDs
}

export async function fetchRoomDetails(accessToken: string, user: UserPrivate, roomId: string) {
    const matrixUrl = user.matrixUrl;
    const response = await fetch(`${matrixUrl}/client/v3/rooms/${encodeURIComponent(roomId)}/state`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch details for room: ${roomId}`);
    }

    const events = await response.json();

    // Extract room name and avatar
    const nameEvent = events.find((event: any) => event.type === "m.room.name");
    const avatarEvent = events.find((event: any) => event.type === "m.room.avatar");

    return {
        name: nameEvent?.content?.name || "Unnamed Room",
        avatar: avatarEvent?.content?.url
            ? `${matrixUrl}/media/v3/download/${avatarEvent.content.url.replace("mxc://", "")}`
            : "/placeholder.svg", // Fallback avatar
    };
}

export async function startSync(
    accessToken: string,
    matrixUrl: string,
    matrixUsername: string,
    callback: (data: {
        rooms: Record<string, RoomData>;
        latestMessages: Record<string, any>;
        lastReadTimestamps: Record<string, number>;
    }) => void,
    roomId?: string,
) {
    let since: any = localStorage.getItem(roomId ? `syncToken_${roomId}` : "syncToken");
    const maxRetries = 5;
    let retryCount = 0;

    const sync = async () => {
        const url = new URL(`${matrixUrl}/client/v3/sync`);
        console.log("Fetching url", url.toString());

        if (since) url.searchParams.append("since", since);
        if (roomId) url.searchParams.append("filter", JSON.stringify({ room: { rooms: [roomId] } }));
        url.searchParams.append("timeout", "30000");

        try {
            const response = await fetch(url.toString(), {
                method: "GET",
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (response.ok) {
                const data: SyncResponse = await response.json();
                since = data.next_batch;
                if (since) localStorage.setItem(roomId ? `syncToken_${roomId}` : "syncToken", since);

                const latestMessages: Record<string, any> = {};
                const rooms: Record<string, RoomData> = {};
                const lastReadTimestamps: Record<string, number> = JSON.parse(
                    localStorage.getItem("lastReadTimestamps") || "{}",
                );

                for (const [syncRoomId, roomData] of Object.entries(data.rooms?.join || {})) {
                    const timelineEvents = roomData.timeline?.events || [];

                    // Get read receipts specific to the current user
                    const readReceipts = roomData.ephemeral?.events.find(
                        (event) => event.type === "m.receipt",
                    )?.content;

                    console.log("Read receipts", readReceipts);

                    // Find the latest read receipt timestamp for the current user
                    let latestReadTimestamp = lastReadTimestamps[syncRoomId] || 0;
                    if (readReceipts) {
                        for (const [eventId, receiptData] of Object.entries(readReceipts)) {
                            // Match the user's receipt with domain taken into account
                            const receiptUser = Object.keys((receiptData as Record<string, any>)["m.read"] || {}).find(
                                (id) => id.startsWith(`@${matrixUsername}:`),
                            );

                            if (receiptUser) {
                                const userReceipt = (receiptData as Record<string, any>)["m.read"]?.[receiptUser];
                                if (userReceipt && userReceipt.ts > latestReadTimestamp) {
                                    console.log(`New m.read found for user ${receiptUser}`, userReceipt);
                                    latestReadTimestamp = userReceipt.ts;
                                }
                            }
                        }
                    }

                    // Persist the latest read timestamp
                    lastReadTimestamps[syncRoomId] = latestReadTimestamp;

                    // Update latest message for the room
                    if (timelineEvents.length > 0) {
                        latestMessages[syncRoomId] = timelineEvents[timelineEvents.length - 1];
                    }

                    rooms[syncRoomId] = roomData;
                }

                // Invoke callback with the collected data
                callback({ rooms, latestMessages, lastReadTimestamps });

                retryCount = 0;
                await sync();
            } else {
                throw new Error(`Sync failed with status: ${response.status}`);
            }
        } catch (error) {
            console.error("Sync failed, retrying...", error);
            retryCount++;
            if (retryCount <= maxRetries) {
                const backoffTime = Math.min(5000 * Math.pow(2, retryCount), 60000);
                setTimeout(sync, backoffTime);
            } else {
                console.error("Max retries reached. Sync stopped.");
            }
        }
    };

    await sync();
}

export async function fetchRoomMessages(
    accessToken: string,
    matrixUrl: string,
    roomId: string,
    limit: number = 20,
    from?: string,
): Promise<{ messages: any[]; nextBatch: string }> {
    const params = new URLSearchParams({
        dir: "b", // Fetch messages in reverse chronological order
        limit: limit.toString(),
    });

    if (from) {
        params.append("from", from);
    }

    const response = await fetch(
        `${matrixUrl}/client/v3/rooms/${encodeURIComponent(roomId)}/messages?${params.toString()}`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch messages for room ${roomId}`);
    }

    const data = await response.json();
    return {
        messages: data.chunk || [],
        nextBatch: data.end, // Token for the next set of messages
    };
}

export async function sendRoomMessage(accessToken: string, matrixUrl: string, roomId: string, content: string) {
    const txnId = Date.now(); // Use a unique transaction ID
    const response = await fetch(
        `${matrixUrl}/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
        {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                msgtype: "m.text",
                body: content,
            }),
        },
    );

    if (!response.ok) {
        throw new Error("Failed to send message");
    }

    return await response.json();
}

export const markMessagesAsRead = async (accessToken: string, matrixUrl: string, roomId: string, eventId: string) => {
    const url = `${matrixUrl}/client/v3/rooms/${encodeURIComponent(roomId)}/read_markers`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                "m.fully_read": eventId, // Sets the read marker
                "m.read": eventId, // Sets the read receipt
            }),
        });

        // if (!response.ok) {
        //     console.error("Failed to mark messages as read:", response.statusText);
        // } else {
        //     console.log(`Marked as read: ${eventId} in room ${roomId}`);
        //     console.log("Response:", response);
        // }
    } catch (error) {
        console.error("Error marking messages as read:", error);
    }
};

export const sendReadReceipt = async (accessToken: string, matrixUrl: string, roomId: string, eventId: string) => {
    const encodedRoomId = encodeURIComponent(roomId);
    const encodedEventId = encodeURIComponent(eventId);

    const url = `${matrixUrl}/client/v3/rooms/${encodedRoomId}/receipt/m.read/${encodedEventId}`;

    // console.log(`Sending read receipt for event: ${encodedEventId} in room: ${encodedRoomId}`);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
        });

        // if (!response.ok) {
        //     console.error("Failed to send read receipt:", response.statusText);
        // } else {
        //     console.log(`Read receipt sent for event: ${eventId} in room: ${roomId}`);
        // }
    } catch (error) {
        console.error("Error sending read receipt:", error);
    }
};
