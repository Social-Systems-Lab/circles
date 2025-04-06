import { UserGroup, Module, Feature, Cause, Skill, ModuleInfo, CircleType } from "@/models/models";

export const logLevel = 5; // 0: none, 1: error, 2: warn, 3: info, 4: debug, 5: trace
export const LOG_LEVEL_TRACE = 5;

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
    circles: {
        view: {
            name: "View Circles",
            handle: "view",
            description: "View the circles list",
            defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            module: "circles",
        } as Feature,
        create: {
            name: "Create Circle",
            handle: "create",
            description: "Create a new circle",
            defaultUserGroups: ["admins", "moderators", "members"],
            module: "circles",
        } as Feature,
        delete: {
            name: "Delete Circle",
            handle: "delete",
            description: "Delete a circle",
            defaultUserGroups: ["admins"],
            module: "circles",
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
        name: "Feed",
        handle: "feed",
        description:
            "A shared space for circle members to post updates, share ideas, and engage in discussions. Serves as the central communication hub to foster transparent collaboration and community engagement.",
        readOnly: true,
    },
    {
        name: "Followers",
        handle: "followers",
        description:
            "Shows everyone who follows or is part of the circle. Admins can see, manage, and engage with supporters, making it easier to track growth and involvement.",
    },
    {
        name: "Circles",
        handle: "circles",
        description:
            "Displays all sub-circles and affiliated groups connected to this circle. Helps members navigate related communities, deepen partnerships, and organize nested initiatives.",
    },
    {
        name: "Projects",
        handle: "projects",
        description:
            "Lists all projects the circle is working on or supporting. Offers a structured overview of ongoing initiatives, goals, and collaboration opportunities for members.",
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

export const defaultUserModules = ["feed", "followers", "circles", "projects", "settings"];
export const defaultCircleModules = ["feed", "followers", "projects", "settings"];
export const defaultProjectModules = ["feed", "followers", "proposals", "issues", "settings"];

export const getDefaultModules = (circleType: CircleType) => {
    switch (circleType) {
        case "user":
            return defaultUserModules;
        case "circle":
            return defaultCircleModules;
        case "project":
            return defaultProjectModules;
        default:
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

export const causes: Cause[] = [
    {
        handle: "climate-action",
        name: "Climate Action",
        picture: { url: "/images/causes/poly/climate-action.png" },
        description: "Working together to combat climate change and secure a sustainable future for all.",
    },
    {
        handle: "renewable-energy",
        name: "Renewable Energy",
        picture: { url: "/images/causes/poly/renewable-energy.png" },
        description: "Advocating for clean, sustainable energy solutions to power our world.",
    },
    {
        handle: "wildlife-protection",
        name: "Wildlife Protection",
        picture: { url: "/images/causes/poly/wildlife-protection.png" },
        description: "Safeguarding Earth's diverse species for a thriving planet.",
    },
    {
        handle: "healthy-oceans",
        name: "Healthy Oceans",
        picture: { url: "/images/causes/poly/healthy-oceans.png" },
        description: "Preserving our oceans for the well-being of marine life and future generations.",
    },
    {
        handle: "sustainable-forestry",
        name: "Sustainable Forestry",
        picture: { url: "/images/causes/poly/sustainable-forestry.png" },
        description: "Promoting responsible forest management to sustain ecosystems and communities.",
    },
    {
        handle: "sustainable-cities",
        name: "Sustainable Cities",
        picture: { url: "/images/causes/poly/sustainable-cities.png" },
        description: "Building eco-friendly and resilient urban spaces for a better tomorrow.",
    },
    {
        handle: "no-poverty",
        name: "No Poverty",
        picture: { url: "/images/causes/poly/no-poverty.png" },
        description: "Eliminate poverty in all its forms everywhere.",
    },
    {
        handle: "quality-education",
        name: "Quality Education",
        picture: { url: "/images/causes/poly/quality-education.png" },
        description: "Ensuring inclusive and equitable education for all.",
    },
    {
        handle: "global-health",
        name: "Global Health & Well-being",
        picture: { url: "/images/causes/poly/global-health.png" },
        description: "Promoting health and well-being worldwide for a brighter future.",
    },
    {
        handle: "gender-equality",
        name: "Gender Equality",
        picture: { url: "/images/causes/poly/gender-equality.png" },
        description: "Advocating for equal rights and opportunities for all genders.",
    },
    {
        handle: "human-rights",
        name: "Human Rights",
        picture: { url: "/images/causes/poly/human-rights.png" },
        description: "Upholding the fundamental rights and dignities of all people.",
    },
    {
        handle: "asylum-rights",
        name: "Asylum Rights",
        picture: { url: "/images/causes/poly/asylum-rights.png" },
        description: "Protecting the rights of refugees and displaced persons seeking safety.",
    },
    {
        handle: "democracy",
        name: "Democracy",
        picture: { url: "/images/causes/poly/democracy.png" },
        description: "Supporting fair, transparent, and representative governance.",
    },
    {
        handle: "social-justice",
        name: "Social Justice",
        picture: { url: "/images/causes/poly/social-justice.png" },
        description: "Advocating for equality, fairness, and rights for all individuals.",
    },
    {
        handle: "security",
        name: "Security & Protection",
        picture: { url: "/images/causes/poly/security.png" },
        description: "Ensuring safety and protection for all members of society.",
    },
    {
        handle: "peace",
        name: "Peace & Global Unity",
        picture: { url: "/images/causes/poly/peace.png" },
        description: "Fostering harmony and cooperation among all nations.",
    },
    {
        handle: "indigenous-rights",
        name: "Indigenous Peoples' Rights",
        picture: { url: "/images/causes/poly/indigenous-rights.png" },
        description: "Upholding the rights and cultures of Indigenous communities worldwide.",
    },
    {
        handle: "arts-and-culture",
        name: "Arts & Culture",
        picture: { url: "/images/causes/poly/arts-and-culture.png" },
        description: "Celebrating and preserving the diverse expressions of human creativity.",
    },
    {
        handle: "humanitarian-aid",
        name: "Humanitarian Aid",
        picture: { url: "/images/causes/poly/humanitarian-aid.png" },
        description: "Providing relief and support to those in crisis around the world.",
    },
    {
        handle: "animal-rights",
        name: "Animal Rights",
        picture: { url: "/images/causes/poly/animal-rights.png" },
        description: "Ensuring the ethical treatment and protection of all animals.",
    },
    {
        handle: "climate-justice",
        name: "Climate Justice",
        picture: { url: "/images/causes/poly/climate-justice.png" },
        description: "Advocating for equitable solutions to the climate crisis.",
    },
    {
        handle: "system-change",
        name: "System Change",
        picture: { url: "/images/causes/poly/system-change.png" },
        description: "Transforming systems and structures to create a more just and sustainable world.",
    },
    {
        handle: "freedom-of-press",
        name: "Freedom of the Press",
        picture: { url: "/images/causes/poly/freedom-of-press.png" },
        description: "Supporting a free and independent media worldwide.",
    },
    {
        handle: "access-to-justice",
        name: "Access to Justice",
        picture: { url: "/images/causes/poly/access-to-justice.png" },
        description: "Ensuring fair legal processes and equal access to justice for all.",
    },
    {
        handle: "lgbtq-rights",
        name: "LGBTQ+ Rights",
        picture: { url: "/images/causes/poly/lgbtq-rights.png" },
        description: "Advocating for equal rights and acceptance of LGBTQ+ individuals.",
    },
    {
        handle: "digital-rights",
        name: "Digital Rights & Privacy",
        picture: { url: "/images/causes/poly/digital-rights.png" },
        description: "Ensuring the protection of individual freedoms and privacy in the digital age.",
    },
    {
        handle: "civic-engagement",
        name: "Civic Engagement",
        picture: { url: "/images/causes/poly/civic-engagement.png" },
        description: "Empowering citizens to actively participate in shaping their communities and governments.",
    },
    {
        handle: "disability-rights",
        name: "Disability Rights",
        picture: { url: "/images/causes/poly/disability-rights.png" },
        description: "Promoting equal rights and opportunities for individuals with disabilities.",
    },
    {
        handle: "child-rights",
        name: "Child Rights",
        picture: { url: "/images/causes/poly/child-rights.png" },
        description: "Protecting and promoting the rights and well-being of children worldwide.",
    },
    {
        handle: "elderly-care",
        name: "Elderly Care",
        picture: { url: "/images/causes/poly/elderly-care.png" },
        description: "Ensuring dignity, care, and support for elderly individuals in our communities.",
    },
    {
        handle: "food-security",
        name: "Food Security",
        picture: { url: "/images/causes/poly/food-security.png" },
        description: "Working to ensure all individuals have nutritious food.",
    },
    {
        handle: "water-sanitation",
        name: "Water & Sanitation",
        picture: { url: "/images/causes/poly/water-sanitation.png" },
        description: "Promoting clean water and sanitation for all communities.",
    },
    {
        handle: "housing-rights",
        name: "Housing Rights",
        picture: { url: "/images/causes/poly/housing-rights.png" },
        description: "Advocating for safe and adequate housing for all individuals.",
    },
];

export const skills: Skill[] = [
    {
        handle: "leadership",
        name: "Leadership",
        picture: { url: "/images/skills/leadership.png" },
        description: "Inspiring and guiding individuals or groups towards achieving common goals.",
    },
    {
        handle: "public-speaking",
        name: "Public Speaking",
        picture: { url: "/images/skills/public-speaking.png" },
        description: "Effectively communicating messages to audiences with confidence and clarity.",
    },
    {
        handle: "fundraising",
        name: "Fundraising",
        picture: { url: "/images/skills/fundraising.png" },
        description: "Securing financial resources to support initiatives and organizations.",
    },
    {
        handle: "community-organizing",
        name: "Community Organizing",
        picture: { url: "/images/skills/community-organizing.png" },
        description: "Mobilizing and empowering communities to advocate for change.",
    },
    {
        handle: "campaign-management",
        name: "Campaign Management",
        picture: { url: "/images/skills/campaign-management.png" },
        description: "Planning and executing strategies for successful campaigns.",
    },
    {
        handle: "policy-analysis",
        name: "Policy Analysis",
        picture: { url: "/images/skills/policy-analysis.png" },
        description: "Evaluating and formulating policies to address societal issues.",
    },
    {
        handle: "advocacy",
        name: "Advocacy",
        picture: { url: "/images/skills/advocacy.png" },
        description: "Promoting and supporting causes or policies on behalf of others.",
    },
    {
        handle: "negotiation",
        name: "Negotiation",
        picture: { url: "/images/skills/negotiation.png" },
        description: "Reaching agreements through dialogue and compromise.",
    },
    {
        handle: "conflict-resolution",
        name: "Conflict Resolution",
        picture: { url: "/images/skills/conflict-resolution.png" },
        description: "Managing and resolving disputes effectively.",
    },
    {
        handle: "media-relations",
        name: "Media Relations",
        picture: { url: "/images/skills/media-relations.png" },
        description: "Building relationships with media to promote an organization's message.",
    },
    {
        handle: "social-media-management",
        name: "Social Media Management",
        picture: { url: "/images/skills/social-media-management.png" },
        description: "Strategizing and managing social media platforms to engage audiences.",
    },
    {
        handle: "event-planning",
        name: "Event Planning",
        picture: { url: "/images/skills/event-planning.png" },
        description: "Organizing and coordinating events to achieve specific objectives.",
    },
    {
        handle: "volunteer-management",
        name: "Volunteer Management",
        picture: { url: "/images/skills/volunteer-management.png" },
        description: "Recruiting, training, and overseeing volunteers for organizational activities.",
    },
    {
        handle: "grant-writing",
        name: "Grant Writing",
        picture: { url: "/images/skills/grant-writing.png" },
        description: "Composing proposals to secure funding from grant-making entities.",
    },
    {
        handle: "strategic-planning",
        name: "Strategic Planning",
        picture: { url: "/images/skills/strategic-planning.png" },
        description: "Developing long-term objectives and plans to achieve organizational goals.",
    },
    {
        handle: "cross-cultural-communication",
        name: "Cross-Cultural Communication",
        picture: { url: "/images/skills/cross-cultural-communication.png" },
        description: "Effectively communicating and working across diverse cultures.",
    },
    {
        handle: "data-analysis-research",
        name: "Data Analysis & Research",
        picture: { url: "/images/skills/data-analysis-research.png" },
        description: "Interpreting data and conducting research to inform decisions and strategies.",
    },
    {
        handle: "legal-expertise",
        name: "Legal Expertise",
        picture: { url: "/images/skills/legal-expertise.png" },
        description: "Understanding and applying legal principles to support causes.",
    },
    {
        handle: "environmental-science",
        name: "Environmental Science",
        picture: { url: "/images/skills/environmental-science.png" },
        description: "Applying scientific knowledge to address environmental challenges.",
    },
    {
        handle: "economics",
        name: "Economics",
        picture: { url: "/images/skills/economics.png" },
        description: "Analyzing economic factors affecting policies and initiatives.",
    },
    {
        handle: "education-training",
        name: "Education & Training",
        picture: { url: "/images/skills/education-training.png" },
        description: "Developing and delivering educational programs and materials.",
    },
    {
        handle: "healthcare-management",
        name: "Healthcare Management",
        picture: { url: "/images/skills/healthcare-management.png" },
        description: "Overseeing health services and systems to improve public health.",
    },
    {
        handle: "disaster-response",
        name: "Disaster Response & Humanitarian Aid",
        picture: { url: "/images/skills/disaster-response.png" },
        description: "Providing aid and support during and after emergencies.",
    },
    {
        handle: "mental-health-support",
        name: "Mental Health Support",
        picture: { url: "/images/skills/mental-health-support.png" },
        description: "Offering psychological assistance to improve mental well-being.",
    },
    {
        handle: "journalism",
        name: "Journalism",
        picture: { url: "/images/skills/journalism.png" },
        description: "Gathering and disseminating news to inform the public.",
    },
    {
        handle: "graphic-design",
        name: "Graphic Design & Visual Communication",
        picture: { url: "/images/skills/graphic-design.png" },
        description: "Creating visual content to communicate messages.",
    },
    {
        handle: "web-development",
        name: "Web Development & Technology",
        picture: { url: "/images/skills/web-development.png" },
        description: "Building and maintaining websites and utilizing technology for development.",
    },
    {
        handle: "marketing",
        name: "Marketing & Communications",
        picture: { url: "/images/skills/marketing.png" },
        description: "Promoting products, services, or causes to target audiences.",
    },
    {
        handle: "translation",
        name: "Translation & Interpretation",
        picture: { url: "/images/skills/translation.png" },
        description: "Converting information from one language to another accurately.",
    },
    {
        handle: "lobbying",
        name: "Lobbying & Government Relations",
        picture: { url: "/images/skills/lobbying.png" },
        description: "Influencing legislators or officials on behalf of a cause or policy.",
    },
    {
        handle: "facilitation",
        name: "Facilitation & Mediation",
        picture: { url: "/images/skills/facilitation.png" },
        description: "Guiding groups and resolving disputes through collaborative processes.",
    },
    {
        handle: "project-management",
        name: "Project Management",
        picture: { url: "/images/skills/project-management.png" },
        description: "Planning and overseeing projects to ensure they are completed efficiently.",
    },
    {
        handle: "sustainable-development",
        name: "Sustainable Development",
        picture: { url: "/images/skills/sustainable-development.png" },
        description: "Implementing practices that meet present needs without compromising future generations.",
    },
    {
        handle: "international-relations",
        name: "International Relations",
        picture: { url: "/images/skills/international-relations.png" },
        description: "Managing relationships between nations and organizations.",
    },
    {
        handle: "gender-studies",
        name: "Gender Studies",
        picture: { url: "/images/skills/gender-studies.png" },
        description: "Analyzing gender and its intersections with other social categories.",
    },
];
