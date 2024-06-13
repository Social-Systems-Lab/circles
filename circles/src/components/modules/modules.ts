import { features } from "../../lib/data/constants";
import { Circle, Module, Page } from "@/models/models";
import SettingsModule from "@/components/modules/settings/settings";
import SettingsModuleLayout from "./settings/settings-layout";
import MembersModule from "./members/members";

export const modules: Record<string, Module> = {
    home: {
        name: "Home",
        handle: "home",
        description: "Landing page",
        features: [],
    },
    settings: {
        name: "Settings",
        handle: "settings",
        component: SettingsModule,
        layoutComponent: SettingsModuleLayout,
        description: "Settings page",
        features: [features.settings_edit.handle],
    },
    members: {
        name: "Members",
        handle: "members",
        description: "Members page",
        component: MembersModule,
    },
};
