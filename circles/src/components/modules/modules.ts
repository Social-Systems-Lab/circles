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
import dynamic from "next/dynamic";
import ProposalsModule from "./proposals/proposals";

export const modules: Record<string, Module> = {
    home: {
        name: "Home",
        handle: "home",
        description: "Landing page",
        component: FeedsModule, // Temporarily using FeedsModule until Home module is implemented
        defaultIcon: "AiOutlineHome",
    },
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
    followers: {
        name: "Followers",
        handle: "followers",
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
    feed: {
        name: "Feed",
        handle: "feed",
        description: "Feed page",
        component: FeedsModule,
        layoutComponent: FeedsModuleLayout,
        defaultIcon: "AiOutlineWifi",
    },
    proposals: {
        name: "Proposals",
        handle: "proposals",
        description: "Proposals page",
        component: dynamic(() => import("./proposals/proposals")),
        defaultIcon: "AiOutlineFileText",
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
