import { UserGroup, Module, Feature, Cause, Skill, ModuleInfo, CircleType } from "@/models/models";

export const logLevel = 5; // 0: none, 1: error, 2: warn, 3: info, 4: debug, 5: trace
export const LOG_LEVEL_TRACE = 5;
export const RANKING_STALENESS_DAYS = 7; // How many days before a ranking becomes stale

export const features = {
    general: {
        edit_same_level_user_groups: {
            name: "Edit Same Level User Groups",
            handle: "edit_same_level_user_groups",
            description: "Edit circle user groups of same level members",
            defaultUserGroups: ["admins"],
            module: "general",
        } as Feature,
        edit_lower_user_groups: {
            name: "Edit Lower Member User Groups",
            handle: "edit_lower_user_groups",
            description: "Edit circle user groups of lower members",
            defaultUserGroups: ["admins", "moderators"],
            module: "general",
        } as Feature,
        remove_same_level_members: {
            name: "Remove Same Level Members",
            handle: "remove_same_level_members",
            description: "Remove same level members from the circle",
            defaultUserGroups: ["admins"],
            module: "general",
        } as Feature,
        remove_lower_members: {
            name: "Remove Lower Members",
            handle: "remove_lower_members",
            description: "Remove lower members from the circle",
            defaultUserGroups: ["admins", "moderators"],
            module: "general",
        } as Feature,
        manage_membership_requests: {
            name: "Manage Follow Requests",
            handle: "manage_membership_requests",
            description: "Manage requests to follow the circle",
            defaultUserGroups: ["admins", "moderators"],
            module: "general",
        } as Feature,
    },
    feed: {
        view: {
            name: "View Feed",
            handle: "view",
            description: "View the feed",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "feed",
        } as Feature,
        post: {
            name: "Create Post",
            handle: "post",
            description: "Create a post in the feed",
            defaultUserGroups: ["admins", "moderators", "members"],
            module: "feed",
        } as Feature,
        comment: {
            name: "Comment",
            handle: "comment",
            description: "Comment on posts in the feed",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "feed",
        } as Feature,
        moderate: {
            name: "Moderate Feed",
            handle: "moderate",
            description: "Moderate posts in the feed",
            defaultUserGroups: ["admins", "moderators"],
            module: "feed",
        } as Feature,
    },
    chat: {
        view: {
            name: "View Chat",
            handle: "view",
            description: "View the chat messages",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "chat",
        } as Feature,
        moderate: {
            name: "Moderate Chat",
            handle: "moderate",
            description: "Moderate chat messages in the chat",
            defaultUserGroups: ["admins", "moderators"],
            module: "chat",
        } as Feature,
    },
    followers: {
        view: {
            name: "View Followers",
            handle: "view",
            description: "View the followers list",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "followers",
        } as Feature,
    },
    communities: {
        view: {
            name: "View Communities",
            handle: "view",
            description: "View the communities list",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "communities",
        } as Feature,
        create: {
            name: "Create Community",
            handle: "create",
            description: "Create a new circle",
            defaultUserGroups: ["admins", "moderators", "members"],
            module: "communities",
        } as Feature,
        delete: {
            name: "Delete Community",
            handle: "delete",
            description: "Delete a community",
            defaultUserGroups: ["admins"],
            module: "communities",
        } as Feature,
    },
    projects: {
        view: {
            name: "View Projects",
            handle: "view",
            description: "View the projects list",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "projects",
        } as Feature,
        create: {
            name: "Create Project",
            handle: "create",
            description: "Create a new project",
            defaultUserGroups: ["admins", "moderators", "members"],
            module: "projects",
        } as Feature,
    },
    goals: {
        // Added goals module features, mirroring issues
        view: {
            name: "View Goals",
            handle: "view",
            description: "View the goals list and details",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "goals",
        } as Feature,
        update: {
            name: "Update Goals",
            handle: "update",
            description: "Edit existing goals",
            defaultUserGroups: ["admins", "moderators"],
            module: "goals",
        } as Feature,
        create: {
            name: "Create Goals",
            handle: "create",
            description: "Submit a new goal",
            defaultUserGroups: ["admins", "moderators"],
            module: "goals",
        } as Feature,
        review: {
            name: "Review Goals",
            handle: "review",
            description: "Review submitted goals and move them to Open",
            defaultUserGroups: ["admins", "moderators"],
            module: "goals",
        } as Feature,
        resolve: {
            name: "Resolve Goals",
            handle: "resolve",
            description: "Mark goals as resolved or change their stage",
            defaultUserGroups: ["admins", "moderators"],
            module: "goals",
        } as Feature,
        moderate: {
            name: "Moderate Goals",
            handle: "moderate",
            description: "Edit or delete any goal",
            defaultUserGroups: ["admins"],
            module: "goals",
        } as Feature,
        comment: {
            name: "Comment on Goals",
            handle: "comment",
            description: "Add comments to goals",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "goals",
        } as Feature,
        rank: {
            name: "Rank Goals",
            handle: "rank",
            description: "Create and manage a ranking of goals",
            defaultUserGroups: ["admins", "moderators", "members"],
            module: "goals",
        } as Feature,
    },
    tasks: {
        // Added tasks module features, mirroring issues
        view: {
            name: "View Tasks",
            handle: "view",
            description: "View the tasks list and details",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "tasks",
        } as Feature,
        update: {
            name: "Update Tasks",
            handle: "update",
            description: "Edit existing tasks",
            defaultUserGroups: ["admins", "moderators"],
            module: "tasks",
        } as Feature,
        create: {
            name: "Create Tasks",
            handle: "create",
            description: "Submit a new task",
            defaultUserGroups: ["admins", "moderators"],
            module: "tasks",
        } as Feature,
        review: {
            name: "Review Tasks",
            handle: "review",
            description: "Review submitted tasks and move them to Open",
            defaultUserGroups: ["admins", "moderators"],
            module: "tasks",
        } as Feature,
        assign: {
            name: "Assign Tasks",
            handle: "assign",
            description: "Assign a task to a user",
            defaultUserGroups: ["admins", "moderators"],
            module: "tasks",
        } as Feature,
        resolve: {
            name: "Resolve Tasks",
            handle: "resolve",
            description: "Mark tasks as resolved or change their stage",
            defaultUserGroups: ["admins", "moderators"],
            module: "tasks",
        } as Feature,
        moderate: {
            name: "Moderate Tasks",
            handle: "moderate",
            description: "Edit or delete any task",
            defaultUserGroups: ["admins"],
            module: "tasks",
        } as Feature,
        comment: {
            name: "Comment on Tasks",
            handle: "comment",
            description: "Add comments to tasks",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "tasks",
        } as Feature,
        rank: {
            name: "Rank Tasks",
            handle: "rank",
            description: "Create and manage a ranking of tasks",
            defaultUserGroups: ["admins", "moderators", "members"],
            module: "tasks",
        } as Feature,
    },
    proposals: {
        view: {
            name: "View Proposals",
            handle: "view",
            description: "View the proposals list",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "proposals",
        } as Feature,
        create: {
            name: "Create Proposal",
            handle: "create",
            description: "Create a new proposal",
            defaultUserGroups: ["admins", "moderators", "members"],
            module: "proposals",
        } as Feature,
        review: {
            name: "Review Proposals",
            handle: "review",
            description: "Review proposals and move them to voting stage",
            defaultUserGroups: ["admins", "moderators"],
            module: "proposals",
        } as Feature,
        vote: {
            name: "Vote on Proposals",
            handle: "vote",
            description: "Vote on proposals in the voting stage",
            defaultUserGroups: ["admins", "moderators", "members"],
            module: "proposals",
        } as Feature,
        resolve: {
            name: "Resolve Proposals",
            handle: "resolve",
            description: "Mark proposals as resolved (accepted/rejected)",
            defaultUserGroups: ["admins", "moderators"],
            module: "proposals",
        } as Feature,
        moderate: {
            name: "Moderate Proposals",
            handle: "moderate",
            description: "Edit or delete any proposal",
            defaultUserGroups: ["admins"],
            module: "proposals",
        } as Feature,
        rank: {
            name: "Rank Proposals",
            handle: "rank",
            description: "Create and manage a ranking of proposals",
            defaultUserGroups: ["admins", "moderators", "members"], // Same as tasks/goals
            module: "proposals",
        } as Feature,
    },
    issues: {
        view: {
            name: "View Issues",
            handle: "view",
            description: "View the issues list and details",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"], // Default: All can view
            module: "issues",
        } as Feature,
        update: {
            name: "Update Issues",
            handle: "update",
            description: "Edit existing issues",
            defaultUserGroups: ["admins", "moderators"], // Default: Mods+ can update (or creator?)
            module: "issues",
        } as Feature,
        create: {
            name: "Create Issues",
            handle: "create",
            description: "Submit a new issue",
            defaultUserGroups: ["admins", "moderators", "members"], // Default: Members+ can create
            module: "issues",
        } as Feature,
        review: {
            name: "Review Issues",
            handle: "review",
            description: "Review submitted issues and move them to Open",
            defaultUserGroups: ["admins", "moderators"], // Default: Mods+ can review
            module: "issues",
        } as Feature,
        assign: {
            name: "Assign Issues",
            handle: "assign",
            description: "Assign an issue to a user",
            defaultUserGroups: ["admins", "moderators"], // Default: Mods+ can assign (can be opened up)
            module: "issues",
        } as Feature,
        resolve: {
            name: "Resolve Issues",
            handle: "resolve",
            description: "Mark issues as resolved or change their stage",
            defaultUserGroups: ["admins", "moderators"], // Default: Mods+ can resolve (or assignee)
            module: "issues",
        } as Feature,
        moderate: {
            name: "Moderate Issues",
            handle: "moderate",
            description: "Edit or delete any issue",
            defaultUserGroups: ["admins"], // Default: Admins only
            module: "issues",
        } as Feature,
        comment: {
            name: "Comment on Issues",
            handle: "comment",
            description: "Add comments to issues",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"], // Default: All who can view can comment
            module: "issues",
        } as Feature,
        rank: {
            name: "Rank Issues",
            handle: "rank",
            description: "Create and manage a ranking of issues",
            defaultUserGroups: ["admins", "moderators", "members"], // Same as tasks/goals/proposals
            module: "issues",
        } as Feature,
    },
    settings: {
        view: {
            name: "View Settings",
            handle: "view",
            description: "View the settings page",
            defaultUserGroups: ["admins"],
            module: "settings",
        } as Feature,
        edit_about: {
            name: "Edit About",
            handle: "edit_about",
            description: "Edit circle about settings",
            defaultUserGroups: ["admins"],
            module: "settings",
        } as Feature,
        edit_user_groups: {
            name: "Edit User Groups",
            handle: "edit_user_groups",
            description: "Edit user groups settings",
            defaultUserGroups: ["admins"],
            module: "settings",
        } as Feature,
        edit_pages: {
            name: "Edit Pages",
            handle: "edit_pages",
            description: "Edit pages settings",
            defaultUserGroups: ["admins"],
            module: "settings",
        } as Feature,
        edit_access_rules: {
            name: "Edit Access Rules",
            handle: "edit_access_rules",
            description: "Edit circle access rules settings",
            defaultUserGroups: ["admins"],
            module: "settings",
        } as Feature,
        edit_causes_and_skills: {
            name: "Edit Causes and Skills",
            handle: "edit_causes_and_skills",
            description: "Edit causes and skills",
            defaultUserGroups: ["admins"],
            module: "settings",
        } as Feature,
        edit_questionnaire: {
            name: "Edit Questionnaire",
            handle: "edit_questionnaire",
            description: "Edit questionnaire settings",
            defaultUserGroups: ["admins"],
            module: "settings",
        } as Feature,
        edit_critical_settings: {
            name: "Edit Critical Settings",
            handle: "edit_critical_settings",
            description: "Edit critical and sensitive settings",
            defaultUserGroups: ["admins"],
            module: "settings",
        } as Feature,
    },
    home: {
        view: {
            name: "View Home",
            handle: "view",
            description: "View the home page",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "home",
        } as Feature,
    },
};

export const modules: ModuleInfo[] = [
    {
        name: "Home",
        handle: "home",
        description:
            "The main landing page for the circle, showcasing its purpose and recent activity. Provides an introduction for non-members and an overview for members.",
        readOnly: true, // Admins cannot disable this module
    },
    {
        name: "Feed",
        handle: "feed",
        description:
            "A shared space for circle members to post updates, share ideas, and engage in discussions. Serves as the central communication hub to foster transparent collaboration and community engagement.",
    },
    {
        name: "Followers",
        handle: "followers",
        description:
            "Shows everyone who follows or is part of the circle. Admins can see, manage, and engage with supporters, making it easier to track growth and involvement.",
    },
    {
        name: "Communities",
        handle: "communities",
        description:
            "Displays all communities connected to this community. Helps members navigate related communities, deepen partnerships, and organize nested initiatives.",
    },
    {
        name: "Projects",
        handle: "projects",
        description:
            "Lists all projects the circle is working on or supporting. Offers a structured overview of ongoing initiatives, goals, and collaboration opportunities for members.",
    },
    {
        name: "Goals",
        handle: "goals",
        description:
            "Create, track, and celebrate the specific, measurable achievements your circle or project is working towards. Goals provide clear targets with defined victory conditions, helping to focus effort and measure progress. Link tasks directly to goals to see how day-to-day activities contribute to the bigger picture.",
    },
    {
        name: "Tasks",
        handle: "tasks",
        description:
            "Manage and track tasks within the circle. Users can create tasks, assign them, and monitor progress through various stages.",
    },
    {
        name: "Proposals",
        handle: "proposals",
        description:
            "A structured system for collecting and deciding on ideas or motions within the circle. Proposals move through stages from drafting to resolution, enabling transparent decision-making.",
    },
    {
        name: "Issues",
        handle: "issues",
        description:
            "Track and resolve issues within the circle. Users can submit problems, assign tasks, and monitor progress through stages like Review, Open, In Progress, and Resolved.",
    },
    {
        name: "Settings",
        handle: "settings",
        description:
            "Provides administrative controls for circle governance and customization. Manage privacy levels, user groups, questionnaires, location settings, and more to shape the circle's operations.",
        readOnly: true,
    },
];

export const defaultUserModules = ["home", "feed", "followers", "communities", "projects", "goals", "settings"];
export const defaultCircleModules = ["home", "feed", "followers", "projects", "goals", "settings"];
export const defaultProjectModules = ["home", "feed", "followers", "goals", "tasks", "proposals", "issues", "settings"]; // Added 'tasks'

export const getDefaultModules = (circleType: CircleType): string[] => {
    switch (circleType) {
        case "user":
            return defaultUserModules;
        case "circle":
            return defaultCircleModules;
        case "project":
            return defaultProjectModules;
        default:
            // Default to user modules if type is unknown or not specified
            return defaultUserModules;
    }
};

// No longer needed - removed prefixes

// Helper function to get all features for a specific module
export const getModuleFeatures = (moduleHandle: string): Record<string, Feature> | Feature[] => {
    return features[moduleHandle as keyof typeof features] || {};
};

// Helper function to get a specific feature
export const getFeature = (moduleHandle: string, featureHandle: string): Feature | undefined => {
    const moduleFeatures = features[moduleHandle as keyof typeof features] || {};
    return moduleFeatures[featureHandle as keyof typeof moduleFeatures];
};

// Helper function to get all available modules
export const getAvailableModules = (): string[] => {
    return Object.keys(features);
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
        name: "Followers",
        handle: "members",
        title: "Follower",
        description: "Follower of the circle",
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
        name: "Followers",
        handle: "members",
        title: "Followers",
        description: "Followers",
        accessLevel: 300,
        readOnly: true,
    },
];

// This function is no longer needed with the new access rules structure
export const getModuleFeaturePrefix = (moduleHandle: string): string => {
    // Return empty string as we no longer use prefixes
    return "";
};

/**
 * Get default access rules for a circle
 * @param enabledModules Optional list of enabled modules
 * @returns Record of access rules
 */
export const getDefaultAccessRules = (enabledModules?: string[]): Record<string, Record<string, string[]>> => {
    // Create nested access rules by module
    let accessRules: Record<string, Record<string, string[]>> = {};

    // Initialize with empty objects for each module
    for (const moduleHandle of Object.keys(features)) {
        accessRules[moduleHandle] = {};
    }

    // Add general features
    for (const featureHandle in features.general) {
        const feature = features.general[featureHandle as keyof typeof features.general];
        accessRules.general[featureHandle] = feature.defaultUserGroups || [];
    }

    // If enabledModules is provided, only include those modules
    const modulesToInclude = enabledModules || Object.keys(features);

    // Add module-specific features
    for (const moduleHandle of modulesToInclude) {
        if (moduleHandle === "general") continue; // Already handled above

        // Skip if module doesn't exist in features
        if (!features[moduleHandle as keyof typeof features]) continue;

        const moduleFeatures = features[moduleHandle as keyof typeof features];

        // Add each feature for this module
        for (const featureHandle in moduleFeatures) {
            const feature = (moduleFeatures as any)[featureHandle];
            if (feature && feature.defaultUserGroups) {
                accessRules[moduleHandle][featureHandle] = feature.defaultUserGroups;
            }
        }
    }

    return accessRules;
};
