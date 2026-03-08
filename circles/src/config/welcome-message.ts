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
    markdown: `Welcome to Kamooni

Kamooni is a community-owned platform for people and circles who want to build trust-based collaboration.

**Start here**
[Follow the Kamooni circle](https://kamooni.org/circles/kamooni)

Once you follow it, updates from the team will appear in your feed.

**Help us improve Kamooni**
If you run into bugs or glitches, please report them here:
[Report an issue](https://kamooni.org/circles/kamooni/issues)

If you have ideas for how Kamooni could improve, please add them here:
[Submit a proposal](https://kamooni.org/circles/kamooni/proposals)

**About the project**
Kamooni is being developed by Social Systems Lab.
[Learn more about Social Systems Lab](https://www.socialsystems.io/)

Thanks for being here early.

— The Kamooni Team`,
};
