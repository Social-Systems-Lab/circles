import { Skill } from "@/models/models";

export type SkillLevel = "beginner" | "intermediate" | "advanced" | "professional";

export type SkillCategory =
    | "governance-leadership"
    | "community-movement"
    | "policy-advocacy"
    | "communications-media"
    | "technology-digital"
    | "creative-design"
    | "research-analysis"
    | "education-capacity"
    | "health-wellbeing"
    | "environment-sustainability"
    | "operations-delivery"
    | "finance-fundraising"
    | "international-development"
    | "local-practical";

export type SkillV2 = Skill & {
    category: SkillCategory;
};

export type UserSkillV2 = {
    handle: string;
    level: SkillLevel;
};

export const skillCategoryLabels: Record<SkillCategory, string> = {
    "governance-leadership": "Governance & Leadership",
    "community-movement": "Community & Movement Building",
    "policy-advocacy": "Policy, Law & Advocacy",
    "communications-media": "Communications & Media",
    "technology-digital": "Technology & Digital",
    "creative-design": "Creative & Design",
    "research-analysis": "Research & Analysis",
    "education-capacity": "Education & Capacity Building",
    "health-wellbeing": "Health & Wellbeing",
    "environment-sustainability": "Environment & Sustainability",
    "operations-delivery": "Operations & Project Delivery",
    "finance-fundraising": "Finance & Fundraising",
    "international-development": "International Development",
    "local-practical": "Local & Practical Skills",
};

export const skillsV2: SkillV2[] = [
    {
        handle: "leadership",
        name: "Leadership",
        picture: { url: "/images/skills/leadership.png" },
        description: "Inspiring and guiding individuals or groups towards achieving common goals.",
        category: "governance-leadership",
    },
    {
        handle: "public-speaking",
        name: "Public Speaking",
        picture: { url: "/images/skills/public-speaking.png" },
        description: "Effectively communicating messages to audiences with confidence and clarity.",
        category: "community-movement",
    },
    {
        handle: "fundraising",
        name: "Fundraising",
        picture: { url: "/images/skills/fundraising.png" },
        description: "Securing financial resources to support initiatives and organizations.",
        category: "finance-fundraising",
    },
    {
        handle: "community-organizing",
        name: "Community Organizing",
        picture: { url: "/images/skills/community-organizing.png" },
        description: "Mobilizing and empowering communities to advocate for change.",
        category: "community-movement",
    },
    {
        handle: "campaign-management",
        name: "Campaign Management",
        picture: { url: "/images/skills/campaign-management.png" },
        description: "Planning and executing strategies for successful campaigns.",
        category: "community-movement",
    },
    {
        handle: "policy-analysis",
        name: "Policy Analysis",
        picture: { url: "/images/skills/policy-analysis.png" },
        description: "Evaluating and formulating policies to address societal issues.",
        category: "policy-advocacy",
    },
    {
        handle: "advocacy",
        name: "Advocacy",
        picture: { url: "/images/skills/advocacy.png" },
        description: "Promoting and supporting causes or policies on behalf of others.",
        category: "policy-advocacy",
    },
    {
        handle: "negotiation",
        name: "Negotiation",
        picture: { url: "/images/skills/negotiation.png" },
        description: "Reaching agreements through dialogue and compromise.",
        category: "governance-leadership",
    },
    {
        handle: "conflict-resolution",
        name: "Conflict Resolution",
        picture: { url: "/images/skills/conflict-resolution.png" },
        description: "Managing and resolving disputes effectively.",
        category: "governance-leadership",
    },
    {
        handle: "media-relations",
        name: "Media Relations",
        picture: { url: "/images/skills/media-relations.png" },
        description: "Building relationships with media to promote an organization's message.",
        category: "communications-media",
    },
    {
        handle: "social-media-management",
        name: "Social Media Management",
        picture: { url: "/images/skills/social-media-management.png" },
        description: "Strategizing and managing social media platforms to engage audiences.",
        category: "communications-media",
    },
    {
        handle: "event-planning",
        name: "Event Planning",
        picture: { url: "/images/skills/event-planning.png" },
        description: "Organizing and coordinating events to achieve specific objectives.",
        category: "operations-delivery",
    },
    {
        handle: "volunteer-management",
        name: "Volunteer Management",
        picture: { url: "/images/skills/volunteer-management.png" },
        description: "Recruiting, training, and overseeing volunteers for organizational activities.",
        category: "community-movement",
    },
    {
        handle: "grant-writing",
        name: "Grant Writing",
        picture: { url: "/images/skills/grant-writing.png" },
        description: "Composing proposals to secure funding from grant-making entities.",
        category: "finance-fundraising",
    },
    {
        handle: "strategic-planning",
        name: "Strategic Planning",
        picture: { url: "/images/skills/strategic-planning.png" },
        description: "Developing long-term objectives and plans to achieve organizational goals.",
        category: "governance-leadership",
    },
    {
        handle: "cross-cultural-communication",
        name: "Cross-Cultural Communication",
        picture: { url: "/images/skills/cross-cultural-communication.png" },
        description: "Effectively communicating and working across diverse cultures.",
        category: "community-movement",
    },
    {
        handle: "data-analysis-research",
        name: "Data Analysis & Research",
        picture: { url: "/images/skills/data-analysis-research.png" },
        description: "Interpreting data and conducting research to inform decisions and strategies.",
        category: "research-analysis",
    },
    {
        handle: "legal-expertise",
        name: "Legal Expertise",
        picture: { url: "/images/skills/legal-expertise.png" },
        description: "Understanding and applying legal principles to support causes.",
        category: "policy-advocacy",
    },
    {
        handle: "environmental-science",
        name: "Environmental Science",
        picture: { url: "/images/skills/environmental-science.png" },
        description: "Applying scientific knowledge to address environmental challenges.",
        category: "environment-sustainability",
    },
    {
        handle: "economics",
        name: "Economics",
        picture: { url: "/images/skills/economics.png" },
        description: "Analyzing economic factors affecting policies and initiatives.",
        category: "research-analysis",
    },
    {
        handle: "education-training",
        name: "Education & Training",
        picture: { url: "/images/skills/education-training.png" },
        description: "Developing and delivering educational programs and materials.",
        category: "education-capacity",
    },
    {
        handle: "healthcare-management",
        name: "Healthcare Management",
        picture: { url: "/images/skills/healthcare-management.png" },
        description: "Overseeing health services and systems to improve public health.",
        category: "health-wellbeing",
    },
    {
        handle: "disaster-response",
        name: "Disaster Response & Humanitarian Aid",
        picture: { url: "/images/skills/disaster-response.png" },
        description: "Providing aid and support during and after emergencies.",
        category: "health-wellbeing",
    },
    {
        handle: "mental-health-support",
        name: "Mental Health Support",
        picture: { url: "/images/skills/mental-health-support.png" },
        description: "Offering psychological assistance to improve mental well-being.",
        category: "health-wellbeing",
    },
    {
        handle: "journalism",
        name: "Journalism",
        picture: { url: "/images/skills/journalism.png" },
        description: "Gathering and disseminating news to inform the public.",
        category: "communications-media",
    },
    {
        handle: "graphic-design",
        name: "Graphic Design & Visual Communication",
        picture: { url: "/images/skills/graphic-design.png" },
        description: "Creating visual content to communicate messages.",
        category: "creative-design",
    },
    {
        handle: "web-development",
        name: "Web Development & Technology",
        picture: { url: "/images/skills/web-development.png" },
        description: "Building and maintaining websites and utilizing technology for development.",
        category: "technology-digital",
    },
    {
        handle: "marketing",
        name: "Marketing & Communications",
        picture: { url: "/images/skills/marketing.png" },
        description: "Promoting products, services, or causes to target audiences.",
        category: "communications-media",
    },
    {
        handle: "translation",
        name: "Translation & Interpretation",
        picture: { url: "/images/skills/translation.png" },
        description: "Converting information from one language to another accurately.",
        category: "communications-media",
    },
    {
        handle: "lobbying",
        name: "Lobbying & Government Relations",
        picture: { url: "/images/skills/lobbying.png" },
        description: "Influencing legislators or officials on behalf of a cause or policy.",
        category: "policy-advocacy",
    },
    {
        handle: "facilitation",
        name: "Facilitation & Mediation",
        picture: { url: "/images/skills/facilitation.png" },
        description: "Guiding groups and resolving disputes through collaborative processes.",
        category: "governance-leadership",
    },
    {
        handle: "project-management",
        name: "Project Management",
        picture: { url: "/images/skills/project-management.png" },
        description: "Planning and overseeing projects to ensure they are completed efficiently.",
        category: "operations-delivery",
    },
    {
        handle: "sustainable-development",
        name: "Sustainable Development",
        picture: { url: "/images/skills/sustainable-development.png" },
        description: "Implementing practices that meet present needs without compromising future generations.",
        category: "environment-sustainability",
    },
    {
        handle: "international-relations",
        name: "International Relations",
        picture: { url: "/images/skills/international-relations.png" },
        description: "Managing relationships between nations and organizations.",
        category: "international-development",
    },
    {
        handle: "gender-studies",
        name: "Gender Studies",
        picture: { url: "/images/skills/gender-studies.png" },
        description: "Analyzing gender and its intersections with other social categories.",
        category: "policy-advocacy",
    },
];
