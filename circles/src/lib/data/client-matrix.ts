// client-matrix.ts
const MATRIX_URL = process.env.NEXT_PUBLIC_MATRIX_URL || "http://127.0.0.1/_matrix";

export async function fetchJoinedRooms(accessToken: string) {
    console.log(`Fetching joined rooms at ${MATRIX_URL}/client/v3/joined_rooms`);

    const response = await fetch(`${MATRIX_URL}/client/v3/joined_rooms`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error("Failed to fetch joined rooms");
    }

    const data = await response.json();
    return data.joined_rooms; // Returns array of room IDs
}

export async function fetchRoomDetails(accessToken: string, roomId: string) {
    const response = await fetch(`${MATRIX_URL}/client/v3/rooms/${encodeURIComponent(roomId)}/state`, {
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
            ? `${MATRIX_URL}/media/v3/download/${avatarEvent.content.url.replace("mxc://", "")}`
            : "/placeholder.svg", // Fallback avatar
    };
}

export async function startSync(accessToken: string, callback: (event: any) => void) {
    let since: any = null; // Track the sync token for pagination
    const sync = async () => {
        const url = new URL(`${MATRIX_URL}/client/v3/sync`);
        if (since) {
            url.searchParams.append("since", since);
        }
        url.searchParams.append("timeout", "30000"); // Long-polling timeout

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.ok) {
            const data = await response.json();
            since = data.next_batch; // Update the sync token
            callback(data); // Process incoming events
            await sync(); // Continue syncing
        } else {
            console.error("Sync failed, retrying...");
            setTimeout(sync, 5000); // Retry after a delay
        }
    };

    await sync();
}

export async function fetchRoomMessages(
    accessToken: string,
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
        `${MATRIX_URL}/client/v3/rooms/${encodeURIComponent(roomId)}/messages?${params.toString()}`,
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

export async function sendRoomMessage(accessToken: string, roomId: string, content: string) {
    const txnId = Date.now(); // Use a unique transaction ID
    const response = await fetch(
        `${MATRIX_URL}/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
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
