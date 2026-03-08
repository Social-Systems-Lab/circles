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

export const WELCOME_MESSAGE: WelcomeMessageConfig = {
    senderHandle: "kamooni",
    displayName: "Kamooni",
    avatarUrl: "/icon.svg",
    threadName: "Welcome to Kamooni",
    source: "system_welcome",
    version: "v2",
    repliesDisabled: true,
    markdown: `# Welcome to Kamooni

Kamooni is a community-owned platform for people and circles who want to build trust-based collaboration.

## How to get started
1. Complete your profile so people understand your focus.
2. Explore circles and join the ones that match your mission.
3. Start with one post, message, task, or goal to begin participating.

You can open this thread again anytime for a quick restart guide.`,
};

