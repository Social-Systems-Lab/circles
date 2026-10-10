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
export const getWelcomeMessageOrigin = (value = process.env.CIRCLES_URL): string => {
    try {
        const url = new URL(value || "https://kamooni.org");
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
        return url.origin;
    } catch {
        return "https://kamooni.org";
    }
};

const CIRCLES_URL = getWelcomeMessageOrigin();

export const WELCOME_MESSAGE: WelcomeMessageConfig = {
    senderHandle: KAMOONI_SYSTEM_SENDER.handle,
    displayName: KAMOONI_SYSTEM_SENDER.displayName,
    avatarUrl: KAMOONI_SYSTEM_SENDER.avatarUrl,
    threadName: "Welcome to Kamooni",
    source: "system_welcome",
    version: "v2",
    repliesDisabled: true,
    markdown: `Welcome to Kamooni

Kamooni is a community-owned platform for people and circles who want to build trust-based collaboration.

**Start here**

[Follow the Kamooni circle](${CIRCLES_URL}/circles/kamooni)

Once you follow it, updates from the team will appear in your feed.

**Help us improve Kamooni**

If you run into bugs or glitches, please report them here:

[Report an issue](${CIRCLES_URL}/circles/kamooni/issues)

If you have ideas for how Kamooni could improve, please add them here:

[Submit a proposal](${CIRCLES_URL}/circles/kamooni/proposals)

**About the project**

Kamooni is being developed by Social Systems Lab.

[Learn more about Social Systems Lab](https://www.socialsystems.io/)

Thanks for being here early.

— The Kamooni Team`,
};
