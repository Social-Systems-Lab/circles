import { Module } from "@/models/models";
import SettingsModule from "@/components/modules/settings/settings";
import SettingsModuleLayout from "./settings/settings-layout";
import MembersModule from "./members/members";
import CirclesModule from "./circles/circles";

export const modules: Record<string, Module> = {
    home: {
        name: "Home",
        handle: "home",
        description: "Landing page",
        features: [],
        excludeFromMenu: true,
        defaultIcon: "AiOutlineHome",
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
        name: "Members",
        handle: "members",
        description: "Members page",
        component: MembersModule,
        features: [],
        defaultIcon: "AiOutlineContacts",
    },
    circles: {
        name: "Circles",
        handle: "circles",
        description: "Circles page",
        component: CirclesModule,
        features: [],
        defaultIcon: "FaRegCircle",
    },
};
