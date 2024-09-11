import { Page, UserGroup, Module, Feature } from "@/models/models";

// f3f3f3
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
    manage_membership_requests: {
        name: "Manage Membership Requests",
        handle: "manage_membership_requests",
        description: "Manage membership requests to join the circle",
        defaultUserGroups: ["admins", "moderators"],
    },
    create_subcircle: {
        name: "Create Sub-Circle",
        handle: "create_subcircle",
        description: "Create a new sub-circle that is part of this circle",
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

// default user groups that all users will be created with
export const defaultUserGroupsForUser: UserGroup[] = [
    {
        name: "Admins",
        handle: "admins",
        title: "Admin",
        description: "Administrators",
        accessLevel: 100,
        readOnly: true,
    },
    {
        name: "Moderators",
        handle: "moderators",
        title: "Moderator",
        description: "Moderators",
        accessLevel: 200,
        readOnly: true,
    },
    {
        name: "Friends",
        handle: "members",
        title: "Friend",
        description: "Friends",
        accessLevel: 300,
        readOnly: true,
    },
];

// default pages every circle will be created with
export const defaultPagesForUser: Page[] = [
    {
        name: "Home",
        handle: "",
        description: "Home page",
        module: "home",
        readOnly: true,
        defaultUserGroups: ["admins", "moderators", "members", "everyone"],
    },
    {
        name: "Feeds",
        handle: "feeds",
        description: "Feeds page",
        module: "feeds",
        defaultUserGroups: ["admins", "moderators", "members"],
    },
    {
        name: "Friends",
        handle: "friends",
        description: "Friends page",
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
        name: "Feeds",
        handle: "feeds",
        description: "Feeds page",
        module: "feeds",
        defaultUserGroups: ["admins", "moderators", "members"],
    },
    {
        name: "Members",
        handle: "members",
        description: "Members page",
        module: "members",
        defaultUserGroups: ["admins", "moderators", "members", "everyone"],
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

export const feedFeaturePrefix = "__feed_";
export const feedFeatures: Feature[] = [
    {
        name: "View",
        handle: "view",
        description: "View the feed",
        defaultUserGroups: ["admins", "moderators", "members", "everyone"],
    },
    {
        name: "Post",
        handle: "post",
        description: "Create a post in the feed",
        defaultUserGroups: ["admins", "moderators", "members"],
    },
    {
        name: "Comment",
        handle: "comment",
        description: "Comment on posts in the feed",
        defaultUserGroups: ["admins", "moderators", "members"],
    },
    {
        name: "Moderate",
        handle: "moderate",
        description: "Moderate posts in the feed",
        defaultUserGroups: ["admins", "moderators"],
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

export const getDefaultAccessRulesForUser = () => {
    let accessRules: Record<string, string[]> = {};
    for (let feature in features) {
        accessRules[feature] = (features as { [key: string]: Feature })[feature].defaultUserGroups ?? [];
    }
    // add default access rules for default pages
    for (let page of defaultPagesForUser) {
        accessRules[pageFeaturePrefix + page.handle] = page.defaultUserGroups ?? [];
    }

    return accessRules;
};
