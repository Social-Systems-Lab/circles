import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import {
    getVerificationAttachmentAccess,
    verificationAttachmentDisplayName,
} from "@/lib/data/verification-attachment-access";
import { db } from "@/lib/data/db";
import { getVerificationFile } from "@/lib/data/storage";
import { getUserPrivate } from "@/lib/data/user";
import type { VerificationMessage, VerificationRequest } from "@/models/models";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { Readable } from "stream";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ messageId: string; attachmentIndex: string }> },
) {
    const viewerDid = await getAuthenticatedUserDid();
    if (!viewerDid) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { messageId, attachmentIndex } = await params;
    const index = Number(attachmentIndex);
    if (!ObjectId.isValid(messageId) || !Number.isSafeInteger(index) || index < 0) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const message = await db.collection<VerificationMessage>("verificationMessages").findOne({
        _id: new ObjectId(messageId),
    });
    const attachment = message?.attachments?.[index];
    if (!message || !attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const request = ObjectId.isValid(message.requestId)
        ? await db.collection<VerificationRequest>("verifications").findOne({ _id: new ObjectId(message.requestId) })
        : null;
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const viewer = await getUserPrivate(viewerDid);
    if (getVerificationAttachmentAccess(viewerDid, viewer.isAdmin === true, request) !== "allowed") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const stored = await getVerificationFile(attachment.url);
        return new NextResponse(Readable.toWeb(stored.stream as Readable) as ReadableStream, {
            headers: {
                "Cache-Control": "private, no-store",
                "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
                    verificationAttachmentDisplayName(attachment.originalName),
                )}`,
                "Content-Type": stored.contentType,
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        console.error("Failed to read verification attachment", { messageId, index, error });
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
}
