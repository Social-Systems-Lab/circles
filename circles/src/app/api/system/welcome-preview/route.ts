import { NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { ensureWelcomeMessageForNewUser } from "@/lib/data/mongo-chat";
import { getResolvedWelcomeTemplate } from "@/lib/data/system-message-templates";

export async function POST() {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const resolvedWelcome = await getResolvedWelcomeTemplate();
        const result = await ensureWelcomeMessageForNewUser(userDid, resolvedWelcome.config, resolvedWelcome.senderDid);
        return NextResponse.json({
            success: true,
            conversationId: result.conversationId,
            messageCreated: result.messageCreated,
            source: resolvedWelcome.config.source,
            version: resolvedWelcome.config.version,
            templateSource: resolvedWelcome.templateSource,
        });
    } catch (error) {
        console.error("POST /api/system/welcome-preview failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
