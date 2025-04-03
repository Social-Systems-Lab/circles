import { Module } from "@/models/models";
import SettingsModule from "@/components/modules/settings/settings";
import SettingsModuleLayout from "./settings/settings-layout";
import MembersModule from "./members/members";
import CirclesModule from "./circles/circles";
import ProjectsModule from "./projects/projects";
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
    projects: {
        name: "Projects",
        handle: "projects",
        description: "Projects page",
        component: ProjectsModule,
        defaultIcon: "BsKanban",
    },
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
        name: "Followers",
        handle: "members",
        description: "Followers page",
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
        name: "Feed",
        handle: "feeds",
        description: "Feed page",
        component: FeedsModule,
        layoutComponent: FeedsModuleLayout,
        defaultIcon: "AiOutlineWifi",
    },
    // chat: {
    //     name: "Chat",
    //     handle: "chat",
    //     description: "Chat page",
    //     component: ChatModule,
    //     layoutComponent: ChatModuleLayout,
    //     defaultIcon: "IoChatbubbleOutline",
    // },
};
