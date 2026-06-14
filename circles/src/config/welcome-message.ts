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

export const WELCOME_MESSAGE: WelcomeMessageConfig = {
    senderHandle: KAMOONI_SYSTEM_SENDER.handle,
    displayName: KAMOONI_SYSTEM_SENDER.displayName,
    avatarUrl: KAMOONI_SYSTEM_SENDER.avatarUrl,
    threadName: "Welcome to Peerify",
    source: "system_welcome",
    version: "v2",
    repliesDisabled: true,
    markdown: `Welcome to Peerify

Peerify is a community-driven music platform for artists, fans, hosts, and supporters who want to build trusted local scenes.

**Start here**

[Follow the Peerify circle](https://kamooni.org/circles/kamooni)

Once you follow it, updates from the team will appear in your feed.

**Help us improve Peerify**

If you run into bugs or glitches, please report them here:

[Report an issue](https://kamooni.org/circles/kamooni/issues)

If you have ideas for how Peerify could improve, please add them here:

[Submit a proposal](https://kamooni.org/circles/kamooni/proposals)

**About the project**

Peerify is being developed by Social Systems Lab.

[Learn more about Social Systems Lab](https://www.socialsystems.io/)

Thanks for being here early.

— The Peerify Team`,
};
