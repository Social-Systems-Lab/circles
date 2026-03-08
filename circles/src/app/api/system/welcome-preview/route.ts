import { NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { ensureWelcomeMessageForNewUser } from "@/lib/data/mongo-chat";
import { WELCOME_MESSAGE } from "@/config/welcome-message";

export async function POST() {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await ensureWelcomeMessageForNewUser(userDid, WELCOME_MESSAGE);
        return NextResponse.json({
            success: true,
            conversationId: result.conversationId,
            messageCreated: result.messageCreated,
            source: WELCOME_MESSAGE.source,
            version: WELCOME_MESSAGE.version,
        });
    } catch (error) {
        console.error("POST /api/system/welcome-preview failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

