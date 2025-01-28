import { Module } from "@/models/models";
import SettingsModule from "@/components/modules/settings/settings";
import SettingsModuleLayout from "./settings/settings-layout";
import MembersModule from "./members/members";
import CirclesModule from "./circles/circles";
import FeedsModule from "./feeds/feeds";
import FeedsModuleLayout from "./feeds/feeds-layout";
import ChatModule from "./chat/chat";
import ChatModuleLayout from "./chat/chat-layout";

export const modules: Record<string, Module> = {
    // home: {
    //     name: "Home",
    //     handle: "home",
    //     description: "Landing page",
    //     excludeFromMenu: true,
    //     defaultIcon: "AiOutlineHome",
    // },
    settings: {
        name: "Settings",
        handle: "settings",
        component: SettingsModule,
        layoutComponent: SettingsModuleLayout,
        description: "Settings page",
        excludeFromMenu: true,
        defaultIcon: "AiOutlineSetting",
    },
    members: {
        name: "Members",
        handle: "members",
        description: "Members page",
        component: MembersModule,
        defaultIcon: "AiOutlineContacts",
    },
    circles: {
        name: "Circles",
        handle: "circles",
        description: "Circles page",
        component: CirclesModule,
        defaultIcon: "FaRegCircle",
    },
    feeds: {
        name: "Feeds",
        handle: "feeds",
        description: "Feeds page",
        component: FeedsModule,
        layoutComponent: FeedsModuleLayout,
        defaultIcon: "AiOutlineWifi",
    },
    chat: {
        name: "Chat",
        handle: "chat",
        description: "Chat page",
        component: ChatModule,
        layoutComponent: ChatModuleLayout,
        defaultIcon: "IoChatbubbleOutline",
    },
};
