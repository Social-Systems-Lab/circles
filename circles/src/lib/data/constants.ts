import { Page, UserGroup, Module, Feature, Cause, Skill } from "@/models/models";

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
    // {
    //     name: "Home",
    //     handle: "",
    //     description: "Home page",
    //     module: "home",
    //     readOnly: true,
    //     defaultUserGroups: ["admins", "moderators", "members", "everyone"],
    // },
    {
        name: "Feeds",
        handle: "feeds",
        description: "Feeds page",
        module: "feeds",
        readOnly: true,
        defaultUserGroups: ["admins", "moderators", "members", "everyone"],
    },
    {
        name: "Chat",
        handle: "chat",
        description: "Chat page",
        module: "chat",
        defaultUserGroups: ["admins", "moderators", "members", "everyone"],
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

// default pages every circle will be created with
export const defaultPages: Page[] = [
    // {
    //     name: "Home",
    //     handle: "",
    //     description: "Home page",
    //     module: "home",
    //     readOnly: true,
    //     defaultUserGroups: ["admins", "moderators", "members", "everyone"],
    // },
    {
        name: "Feeds",
        handle: "feeds",
        description: "Feeds page",
        module: "feeds",
        readOnly: true,
        defaultUserGroups: ["admins", "moderators", "members", "everyone"],
    },
    {
        name: "Chat",
        handle: "chat",
        description: "Chat page",
        module: "chat",
        defaultUserGroups: ["admins", "moderators", "members", "everyone"],
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

export const chatFeaturePrefix = "__chat_";
export const chatFeatures: Feature[] = [
    {
        name: "View",
        handle: "view",
        description: "View the chat messages",
        defaultUserGroups: ["admins", "moderators", "members", "everyone"],
    },
    {
        name: "Moderate",
        handle: "moderate",
        description: "Moderate chat messages in the chat",
        defaultUserGroups: ["admins", "moderators"],
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
