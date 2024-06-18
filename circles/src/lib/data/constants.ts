import { Page, UserGroup, Module, Feature } from "@/models/models";

export const features = {
    settings_edit: {
        name: "Edit Settings",
        handle: "settings_edit",
        description: "Edit circle settings",
        defaultUserGroups: ["admins"],
    },
    edit_same_level_user_groups: {
        name: "Edit Same Level User Groups",
        handle: "edit_same_level_user_groups",
        description: "Edit circle user groups of same level members",
        defaultUserGroups: ["admins"],
    },
    edit_lower_user_groups: {
        name: "Edit Lower Member User Groups",
        handle: "edit_lower_user_groups",
        description: "Edit circle user groups of lower members",
        defaultUserGroups: ["admins", "moderators"],
    },
    remove_same_level_members: {
        name: "Remove Same Level Members",
        handle: "remove_same_level_members",
        description: "Remove same level members from the circle",
        defaultUserGroups: ["admins"],
    },
    remove_lower_members: {
        name: "Remove Lower Members",
        handle: "remove_lower_members",
        description: "Remove lower members from the circle",
        defaultUserGroups: ["admins", "moderators"],
    },
};

export const maxAccessLevel = 9999999;

// default user groups that all circles will be created with
export const defaultUserGroups: UserGroup[] = [
    {
        name: "Admins",
        handle: "admins",
        title: "Admin",
        description: "Administrators of the circle",
        accessLevel: 100,
        readOnly: true,
    },
    {
        name: "Moderators",
        handle: "moderators",
        title: "Moderator",
        description: "Moderators of the circle",
        accessLevel: 200,
        readOnly: true,
    },
    {
        name: "Members",
        handle: "members",
        title: "Member",
        description: "Members of the circle",
        accessLevel: 300,
        readOnly: true,
    },
];

// default pages every circle will be created with
export const defaultPages: Page[] = [
    {
        name: "Home",
        handle: "",
        description: "Home page",
        module: "home",
        readOnly: true,
        defaultUserGroups: ["admins", "moderators", "members", "everyone"],
    },
    {
        name: "Members",
        handle: "members",
        description: "Members page",
        module: "members",
        defaultUserGroups: ["admins", "moderators", "members"],
    },
    {
        name: "Settings",
        handle: "settings",
        description: "Settings page",
        module: "settings",
        readOnly: true,
        defaultUserGroups: ["admins"],
    },
];

export const pageFeaturePrefix = "__page_";

export const getDefaultAccessRules = () => {
    let accessRules: Record<string, string[]> = {};
    for (let feature in features) {
        accessRules[feature] = (features as { [key: string]: Feature })[feature].defaultUserGroups ?? [];
    }
    // add default access rules for default pages
    for (let page of defaultPages) {
        accessRules[pageFeaturePrefix + page.handle] = page.defaultUserGroups ?? [];
    }

    return accessRules;
};
