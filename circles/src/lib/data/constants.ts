import { Page, UserGroup, Module, Feature } from "@/models/models";

export const features: Record<string, Feature> = {
    settings_edit: {
        name: "Edit Settings",
        handle: "settings_edit",
        description: "Edit circle settings",
        defaultUserGroups: ["admins"],
    },
};

// default user groups that all circles will be created with
export const defaultUserGroups: UserGroup[] = [
    {
        name: "Admins",
        handle: "admins",
        title: "Admin",
        description: "Administrators of the circle",
        readOnly: true,
    },
    {
        name: "Moderators",
        handle: "moderators",
        title: "Moderator",
        description: "Moderators of the circle",
        readOnly: true,
    },
    {
        name: "Members",
        handle: "members",
        title: "Member",
        description: "Members of the circle",
        readOnly: true,
    },
];

// default access rules every circle will be created with
export const defaultAccessRules = {
    settings_edit: ["admins"],
};

// default pages every circle will be created with
export const defaultPages: Page[] = [
    {
        name: "Home",
        handle: "",
        description: "Home page",
        module: "home",
        readOnly: true,
    },
    {
        name: "Settings",
        handle: "settings",
        description: "Settings page",
        module: "settings",
        readOnly: true,
    },
];
