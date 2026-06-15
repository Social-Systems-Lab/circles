import { getKamooniSystemSender } from "@/config/system-sender";

export type WelcomeMessageConfig = {
    senderHandle: string;
    displayName: string;
    avatarUrl: string;
    threadName: string;
    source: "system_welcome";
    version: string;
    repliesDisabled: boolean;
    markdown: string;
};

export const SYSTEM_MESSAGE_SOURCE_PREFIX = "system_";
export const isSystemMessageSource = (source?: string | null): boolean =>
    typeof source === "string" && source.startsWith(SYSTEM_MESSAGE_SOURCE_PREFIX);

const KAMOONI_SYSTEM_SENDER = getKamooniSystemSender();
const PEERIFY_BASE_URL = "https://peerify.one";

export const WELCOME_MESSAGE: WelcomeMessageConfig = {
    senderHandle: KAMOONI_SYSTEM_SENDER.handle,
    displayName: KAMOONI_SYSTEM_SENDER.displayName,
    avatarUrl: KAMOONI_SYSTEM_SENDER.avatarUrl,
    threadName: "Welcome to Peerify",
    source: "system_welcome",
    version: "v3",
    repliesDisabled: true,
    markdown: `Welcome to Peerify

Peerify helps artists, listeners, fans, and hosts build real music communities around local scenes, trusted connections, and live events.

**Start here**

[Follow the official Peerify circle](${PEERIFY_BASE_URL}/circles/kamooni)

That is where product updates, platform notes, and early pilot announcements will show up first.

**Useful next steps**

- Explore artists, communities, and activity: [Open Explore](${PEERIFY_BASE_URL}/explore)
- Check the latest landing page and overview: [Open Welcome](${PEERIFY_BASE_URL}/welcome)

**Help improve Peerify**

If you hit a bug, glitch, or confusing flow, report it here:

[Report an issue](${PEERIFY_BASE_URL}/circles/kamooni/issues)

If you have a feature idea or product suggestion, add it here:

[Submit a proposal](${PEERIFY_BASE_URL}/circles/kamooni/proposals)

Thanks for joining early and helping shape a more human music platform.

— Peerify`,
};
