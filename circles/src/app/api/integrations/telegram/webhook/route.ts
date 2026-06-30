import { NextRequest, NextResponse } from "next/server";
import { connectTelegramChannelByToken } from "@/lib/data/external-notification-channels";
import { sendTelegramMessage } from "@/lib/integrations/telegram";

const extractStartToken = (text?: string): string | null => {
    if (!text) return null;
    const match = text.trim().match(/^\/start(?:@\w+)?\s+(.+)$/);
    return match?.[1]?.trim() || null;
};

const isAuthorizedRequest = (request: NextRequest): boolean => {
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!configuredSecret) return true;

    const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
    const querySecret = request.nextUrl.searchParams.get("secret");
    return headerSecret === configuredSecret || querySecret === configuredSecret;
};

export async function POST(request: NextRequest) {
    if (!isAuthorizedRequest(request)) {
        return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await request.json().catch(() => null);
    const message = update?.message;
    const token = extractStartToken(message?.text);
    const chatId = message?.chat?.id;

    if (!token || chatId === undefined || chatId === null) {
        return NextResponse.json({ ok: true });
    }

    const username =
        typeof message?.from?.username === "string"
            ? message.from.username
            : typeof message?.chat?.username === "string"
              ? message.chat.username
              : undefined;

    const connected = await connectTelegramChannelByToken({
        token,
        telegramChatId: String(chatId),
        telegramUsername: username,
    });

    if (connected) {
        await sendTelegramMessage(String(chatId), "Telegram notifications are now connected to your Kamooni account.");
    } else {
        await sendTelegramMessage(String(chatId), "This Kamooni Telegram connection link is invalid or expired.");
    }

    return NextResponse.json({ ok: true });
}
