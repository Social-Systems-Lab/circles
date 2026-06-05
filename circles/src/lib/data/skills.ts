import { Skill } from "@/models/models";

export const skillCategories = [
    "governance-leadership",
    "community-movement",
    "communications-media",
    "design-creative",
    "technology-development",
    "research-knowledge",
    "education-facilitation",
    "operations-support",
] as const;

export type SkillCategory = (typeof skillCategories)[number];

export type CanonicalSkillRecord = {
    slug: string;
    label: string;
    category: SkillCategory;
    description: string;
};

export type SkillDefinition = Skill & {
    slug: string;
    label: string;
    category?: SkillCategory;
    isLegacy?: boolean;
};

export type SkillGroup = {
    key: SkillCategory | "legacy";
    label: string;
    description?: string;
    skills: SkillDefinition[];
};

export const skillCategoryLabels: Record<SkillCategory, string> = {
    "governance-leadership": "Governance & Leadership",
    "community-movement": "Community & Movement",
    "communications-media": "Communications & Media",
    "design-creative": "Design & Creative",
    "technology-development": "Technology & Development",
    "research-knowledge": "Research & Knowledge",
    "education-facilitation": "Education & Facilitation",
    "operations-support": "Operations & Support",
};

const DEFAULT_SKILL_PICTURE = "/images/default-picture.png";

const skillPictureBySlug: Record<string, string> = {
    "strategic-planning": "/images/skills/strategic-planning.png",
    leadership: "/images/skills/leadership.png",
    "project-management": "/images/skills/project-management.png",
    "program-management": "/images/skills/project-management.png",
    "conflict-resolution": "/images/skills/conflict-resolution.png",
    negotiation: "/images/skills/negotiation.png",
    "organizational-development": "/images/skills/leadership.png",
    "community-organizing": "/images/skills/community-organizing.png",
    facilitation: "/images/skills/facilitation.png",
    "workshop-facilitation": "/images/skills/facilitation.png",
    "volunteer-coordination": "/images/skills/volunteer-management.png",
    "event-organizing": "/images/skills/event-planning.png",
    "campaign-management": "/images/skills/campaign-management.png",
    "partnership-building": "/images/skills/cross-cultural-communication.png",
    "public-speaking": "/images/skills/public-speaking.png",
    "media-relations": "/images/skills/media-relations.png",
    "social-media-management": "/images/skills/social-media-management.png",
    "content-writing": "/images/skills/journalism.png",
    copywriting: "/images/skills/marketing.png",
    "newsletter-email-campaigns": "/images/skills/marketing.png",
    "podcasting-audio-production": "/images/skills/journalism.png",
    "graphic-design": "/images/skills/graphic-design.png",
    illustration: "/images/skills/graphic-design.png",
    "ux-ui-design": "/images/skills/graphic-design.png",
    "web-design": "/images/skills/web-development.png",
    "video-editing": "/images/skills/graphic-design.png",
    photography: "/images/skills/graphic-design.png",
    "animation-motion-graphics": "/images/skills/graphic-design.png",
    "web-development": "/images/skills/web-development.png",
    "frontend-development": "/images/skills/web-development.png",
    "backend-development": "/images/skills/web-development.png",
    "mobile-app-development": "/images/skills/web-development.png",
    "devops-infrastructure": "/images/skills/web-development.png",
    "data-engineering": "/images/skills/data-analysis-research.png",
    "open-source-development": "/images/skills/web-development.png",
    research: "/images/skills/data-analysis-research.png",
    "data-analysis": "/images/skills/data-analysis-research.png",
    "policy-analysis": "/images/skills/policy-analysis.png",
    "technical-writing": "/images/skills/journalism.png",
    documentation: "/images/skills/journalism.png",
    "survey-design": "/images/skills/data-analysis-research.png",
    "impact-evaluation": "/images/skills/data-analysis-research.png",
    "teaching-training": "/images/skills/education-training.png",
    "curriculum-design": "/images/skills/education-training.png",
    mentoring: "/images/skills/education-training.png",
    coaching: "/images/skills/facilitation.png",
    "learning-design": "/images/skills/education-training.png",
    "workshop-design": "/images/skills/facilitation.png",
    "knowledge-translation": "/images/skills/education-training.png",
    fundraising: "/images/skills/fundraising.png",
    "grant-writing": "/images/skills/grant-writing.png",
    "finance-budgeting": "/images/skills/economics.png",
    "legal-compliance": "/images/skills/legal-expertise.png",
    administration: "/images/skills/project-management.png",
    translation: "/images/skills/translation.png",
    "logistics-coordination": "/images/skills/event-planning.png",
};

const legacySkillLabels: Record<string, string> = {
    advocacy: "Advocacy",
    "audio-video": "Audio / Video",
    "cross-cultural-communication": "Cross-Cultural Communication",
    "data-analysis-research": "Data Analysis & Research",
    design: "Design",
    development: "Development",
    "disaster-response": "Disaster Response & Humanitarian Aid",
    "education-training": "Education & Training",
    economics: "Economics",
    "environmental-science": "Environmental Science",
    "event-planning": "Event Planning",
    "finance-budgeting": "Finance / Budgeting",
    "gender-studies": "Gender Studies",
    "healthcare-management": "Healthcare Management",
    journalism: "Journalism",
    "legal-compliance": "Legal / Compliance",
    "legal-expertise": "Legal Expertise",
    lobbying: "Lobbying & Government Relations",
    marketing: "Marketing & Communications",
    "media-storytelling": "Media / Storytelling",
    "mental-health-support": "Mental Health Support",
    operations: "Operations",
    partnerships: "Partnerships",
    "product-strategy": "Product / Strategy",
    "project-coordination": "Project Coordination",
    "sustainable-development": "Sustainable Development",
    teaching: "Teaching",
    "international-relations": "International Relations",
    "volunteer-management": "Volunteer Management",
    writing: "Writing",
};

const legacySkillPictureByHandle: Record<string, string> = {
    "cross-cultural-communication": "/images/skills/cross-cultural-communication.png",
    "data-analysis-research": "/images/skills/data-analysis-research.png",
    "disaster-response": "/images/skills/disaster-response.png",
    "education-training": "/images/skills/education-training.png",
    economics: "/images/skills/economics.png",
    "environmental-science": "/images/skills/environmental-science.png",
    "event-planning": "/images/skills/event-planning.png",
    "gender-studies": "/images/skills/gender-studies.png",
    "healthcare-management": "/images/skills/healthcare-management.png",
    journalism: "/images/skills/journalism.png",
    "legal-expertise": "/images/skills/legal-expertise.png",
    lobbying: "/images/skills/lobbying.png",
    marketing: "/images/skills/marketing.png",
    "mental-health-support": "/images/skills/mental-health-support.png",
    "sustainable-development": "/images/skills/sustainable-development.png",
    "international-relations": "/images/skills/international-relations.png",
    "volunteer-management": "/images/skills/volunteer-management.png",
};

export const canonicalSkillTaxonomy: CanonicalSkillRecord[] = [
    {
        slug: "strategic-planning",
        label: "Strategic Planning",
        category: "governance-leadership",
        description: "Set direction, priorities, and long-range plans for collective work.",
    },
    {
        slug: "leadership",
        label: "Leadership",
        category: "governance-leadership",
        description: "Guide teams, build trust, and keep people aligned around shared goals.",
    },
    {
        slug: "project-management",
        label: "Project Management",
        category: "governance-leadership",
        description: "Coordinate timelines, owners, and deliverables to move work forward.",
    },
    {
        slug: "program-management",
        label: "Program Management",
        category: "governance-leadership",
        description: "Oversee multiple related efforts and keep them aligned to strategy.",
    },
    {
        slug: "conflict-resolution",
        label: "Conflict Resolution",
        category: "governance-leadership",
        description: "Work through tensions constructively and restore healthy collaboration.",
    },
    {
        slug: "negotiation",
        label: "Negotiation",
        category: "governance-leadership",
        description: "Reach practical agreements across different interests and constraints.",
    },
    {
        slug: "organizational-development",
        label: "Organizational Development",
        category: "governance-leadership",
        description: "Improve structures, roles, and practices so groups can grow sustainably.",
    },
    {
        slug: "community-organizing",
        label: "Community Organizing",
        category: "community-movement",
        description: "Mobilize people around shared issues, relationships, and collective action.",
    },
    {
        slug: "facilitation",
        label: "Facilitation",
        category: "community-movement",
        description: "Guide meetings and group processes so people can think and act together.",
    },
    {
        slug: "workshop-facilitation",
        label: "Workshop Facilitation",
        category: "community-movement",
        description: "Design and lead interactive sessions that help participants engage deeply.",
    },
    {
        slug: "volunteer-coordination",
        label: "Volunteer Coordination",
        category: "community-movement",
        description: "Recruit, schedule, and support volunteers so they can contribute effectively.",
    },
    {
        slug: "event-organizing",
        label: "Event Organizing",
        category: "community-movement",
        description: "Plan gatherings, logistics, and follow-through for community events.",
    },
    {
        slug: "campaign-management",
        label: "Campaign Management",
        category: "community-movement",
        description: "Run coordinated outreach and action plans to achieve campaign goals.",
    },
    {
        slug: "partnership-building",
        label: "Partnership Building",
        category: "community-movement",
        description: "Develop strong working relationships across groups, institutions, and allies.",
    },
    {
        slug: "public-speaking",
        label: "Public Speaking",
        category: "communications-media",
        description: "Communicate clearly and confidently in front of audiences.",
    },
    {
        slug: "media-relations",
        label: "Media Relations",
        category: "communications-media",
        description: "Build press relationships and position stories for public visibility.",
    },
    {
        slug: "social-media-management",
        label: "Social Media Management",
        category: "communications-media",
        description: "Plan and publish platform content that grows reach and engagement.",
    },
    {
        slug: "content-writing",
        label: "Content Writing",
        category: "communications-media",
        description: "Write clear, audience-focused content for websites, campaigns, and updates.",
    },
    {
        slug: "copywriting",
        label: "Copywriting",
        category: "communications-media",
        description: "Craft persuasive copy for calls to action, campaigns, and landing pages.",
    },
    {
        slug: "newsletter-email-campaigns",
        label: "Newsletter / Email Campaigns",
        category: "communications-media",
        description: "Create email content and campaign flows that keep people informed and engaged.",
    },
    {
        slug: "podcasting-audio-production",
        label: "Podcasting / Audio Production",
        category: "communications-media",
        description: "Record, edit, and publish audio stories, interviews, and podcasts.",
    },
    {
        slug: "graphic-design",
        label: "Graphic Design",
        category: "design-creative",
        description: "Create visuals that make messages, campaigns, and brands easier to understand.",
    },
    {
        slug: "illustration",
        label: "Illustration",
        category: "design-creative",
        description: "Develop original artwork for storytelling, education, and identity systems.",
    },
    {
        slug: "ux-ui-design",
        label: "UX / UI Design",
        category: "design-creative",
        description: "Shape digital experiences that are usable, intuitive, and visually coherent.",
    },
    {
        slug: "web-design",
        label: "Web Design",
        category: "design-creative",
        description: "Design websites that balance communication goals, aesthetics, and usability.",
    },
    {
        slug: "video-editing",
        label: "Video Editing",
        category: "design-creative",
        description: "Assemble footage, pacing, and audio into clear and compelling videos.",
    },
    {
        slug: "photography",
        label: "Photography",
        category: "design-creative",
        description: "Capture images that document work, tell stories, and support campaigns.",
    },
    {
        slug: "animation-motion-graphics",
        label: "Animation / Motion Graphics",
        category: "design-creative",
        description: "Create motion-based visuals for explainers, campaigns, and product storytelling.",
    },
    {
        slug: "web-development",
        label: "Web Development",
        category: "technology-development",
        description: "Build and maintain websites and web applications.",
    },
    {
        slug: "frontend-development",
        label: "Frontend Development",
        category: "technology-development",
        description: "Implement interfaces that are responsive, accessible, and polished.",
    },
    {
        slug: "backend-development",
        label: "Backend Development",
        category: "technology-development",
        description: "Build server-side systems, APIs, and data flows that support products.",
    },
    {
        slug: "mobile-app-development",
        label: "Mobile App Development",
        category: "technology-development",
        description: "Create native or cross-platform apps for phones and tablets.",
    },
    {
        slug: "devops-infrastructure",
        label: "DevOps / Infrastructure",
        category: "technology-development",
        description: "Manage deployment, hosting, observability, and runtime reliability.",
    },
    {
        slug: "data-engineering",
        label: "Data Engineering",
        category: "technology-development",
        description: "Design pipelines and systems that move, shape, and store data well.",
    },
    {
        slug: "open-source-development",
        label: "Open Source Development",
        category: "technology-development",
        description: "Build collaboratively in public codebases and distributed contributor workflows.",
    },
    {
        slug: "research",
        label: "Research",
        category: "research-knowledge",
        description: "Investigate questions systematically and turn findings into usable insight.",
    },
    {
        slug: "data-analysis",
        label: "Data Analysis",
        category: "research-knowledge",
        description: "Interpret quantitative or qualitative data to support decisions.",
    },
    {
        slug: "policy-analysis",
        label: "Policy Analysis",
        category: "research-knowledge",
        description: "Assess policy options, impacts, and tradeoffs in practical terms.",
    },
    {
        slug: "technical-writing",
        label: "Technical Writing",
        category: "research-knowledge",
        description: "Explain systems, processes, and tools clearly for technical audiences.",
    },
    {
        slug: "documentation",
        label: "Documentation",
        category: "research-knowledge",
        description: "Create and maintain reference material people can actually use.",
    },
    {
        slug: "survey-design",
        label: "Survey Design",
        category: "research-knowledge",
        description: "Write surveys and collection plans that generate useful responses.",
    },
    {
        slug: "impact-evaluation",
        label: "Impact Evaluation",
        category: "research-knowledge",
        description: "Measure outcomes and learn what changed, for whom, and why.",
    },
    {
        slug: "teaching-training",
        label: "Teaching / Training",
        category: "education-facilitation",
        description: "Teach skills, transfer knowledge, and support people as they learn.",
    },
    {
        slug: "curriculum-design",
        label: "Curriculum Design",
        category: "education-facilitation",
        description: "Structure learning journeys, sequences, and materials around outcomes.",
    },
    {
        slug: "mentoring",
        label: "Mentoring",
        category: "education-facilitation",
        description: "Support people over time through guidance, reflection, and encouragement.",
    },
    {
        slug: "coaching",
        label: "Coaching",
        category: "education-facilitation",
        description: "Help individuals improve performance through focused practice and feedback.",
    },
    {
        slug: "learning-design",
        label: "Learning Design",
        category: "education-facilitation",
        description: "Design engaging learning experiences across formats and contexts.",
    },
    {
        slug: "workshop-design",
        label: "Workshop Design",
        category: "education-facilitation",
        description: "Plan sessions with clear outcomes, activities, timing, and flow.",
    },
    {
        slug: "knowledge-translation",
        label: "Knowledge Translation",
        category: "education-facilitation",
        description: "Turn complex knowledge into forms that broader audiences can use.",
    },
    {
        slug: "fundraising",
        label: "Fundraising",
        category: "operations-support",
        description: "Secure resources through donor relationships, appeals, and revenue strategies.",
    },
    {
        slug: "grant-writing",
        label: "Grant Writing",
        category: "operations-support",
        description: "Develop grant proposals, narratives, and supporting materials for funders.",
    },
    {
        slug: "finance-budgeting",
        label: "Budgeting / Financial Planning",
        category: "operations-support",
        description: "Build budgets, forecasts, and financial plans that support responsible growth.",
    },
    {
        slug: "legal-compliance",
        label: "Legal / Compliance",
        category: "operations-support",
        description: "Support contracts, policies, governance, and regulatory obligations.",
    },
    {
        slug: "administration",
        label: "Administration",
        category: "operations-support",
        description: "Keep operations running through organized, dependable administrative support.",
    },
    {
        slug: "translation",
        label: "Translation",
        category: "operations-support",
        description: "Translate language accurately so more people can participate.",
    },
    {
        slug: "logistics-coordination",
        label: "Logistics & Coordination",
        category: "operations-support",
        description: "Coordinate schedules, materials, movement, and operational details.",
    },
];

export const featuredSkillSlugs = [
    "strategic-planning",
    "project-management",
    "community-organizing",
    "facilitation",
    "event-organizing",
    "public-speaking",
    "social-media-management",
    "content-writing",
    "graphic-design",
    "video-editing",
    "web-development",
    "research",
    "data-analysis",
    "teaching-training",
    "fundraising",
    "translation",
] as const;

const skillPicture = (slug: string) => ({
    url: skillPictureBySlug[slug] || DEFAULT_SKILL_PICTURE,
});

const toSkillDefinition = (record: CanonicalSkillRecord): SkillDefinition => ({
    slug: record.slug,
    label: record.label,
    category: record.category,
    handle: record.slug,
    name: record.label,
    description: record.description,
    picture: skillPicture(record.slug),
});

export const skillDefinitions: SkillDefinition[] = canonicalSkillTaxonomy.map(toSkillDefinition);
export const skills: Skill[] = skillDefinitions.map(({ handle, name, description, picture }) => ({
    handle,
    name,
    description,
    picture,
}));

export const featuredSkills: SkillDefinition[] = featuredSkillSlugs
    .map((slug) => skillDefinitions.find((skill) => skill.handle === slug))
    .filter(Boolean) as SkillDefinition[];

const canonicalSkillByHandle = new Map(skillDefinitions.map((skill) => [skill.handle, skill] as const));
const canonicalSkillHandleSet = new Set(skillDefinitions.map((skill) => skill.handle));

export const humanizeSkillHandle = (handle: string): string =>
    handle
        .split("-")
        .filter(Boolean)
        .map((part) => {
            if (part.length <= 3) {
                return part.toUpperCase();
            }
            return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join(" ");

export const isCanonicalSkillHandle = (handle: string): boolean => canonicalSkillHandleSet.has(handle);

const createLegacySkill = (handle: string): SkillDefinition => {
    const label = legacySkillLabels[handle] || humanizeSkillHandle(handle);

    return {
        slug: handle,
        label,
        handle,
        name: label,
        description: "Saved from an earlier skill list. Keep it selected unless you want to replace it.",
        picture: {
            url: legacySkillPictureByHandle[handle] || DEFAULT_SKILL_PICTURE,
        },
        isLegacy: true,
    };
};

export const getSkillDefinitionByHandle = (handle?: string | null): SkillDefinition | undefined => {
    if (!handle) return undefined;
    return canonicalSkillByHandle.get(handle) || createLegacySkill(handle);
};

export const getSkillByHandle = (handle?: string | null): Skill | undefined => {
    const skill = getSkillDefinitionByHandle(handle);
    if (!skill) return undefined;

    return {
        handle: skill.handle,
        name: skill.name,
        description: skill.description,
        picture: skill.picture,
    };
};

export const getSkillDefinitionsByHandles = (handles?: readonly string[] | null): SkillDefinition[] =>
    (handles || [])
        .map((handle) => getSkillDefinitionByHandle(handle))
        .filter(Boolean) as SkillDefinition[];

export const getSkillsByHandles = (handles?: readonly string[] | null): Skill[] =>
    getSkillDefinitionsByHandles(handles).map(({ handle, name, description, picture }) => ({
        handle,
        name,
        description,
        picture,
    }));

export const getSkillLabelByHandle = (handle?: string | null): string => {
    if (!handle) return "";
    return getSkillDefinitionByHandle(handle)?.label || humanizeSkillHandle(handle);
};

export const groupSkillDefinitions = (items: readonly SkillDefinition[]): SkillGroup[] => {
    const groups: SkillGroup[] = [];

    for (const category of skillCategories) {
        const categorySkills = items.filter((skill) => !skill.isLegacy && skill.category === category);
        if (categorySkills.length > 0) {
            groups.push({
                key: category,
                label: skillCategoryLabels[category],
                skills: categorySkills,
            });
        }
    }

    const legacySkills = items.filter((skill) => skill.isLegacy);
    if (legacySkills.length > 0) {
        groups.push({
            key: "legacy",
            label: "Legacy / Other Skills",
            description: "Previously saved skills outside the current taxonomy.",
            skills: legacySkills,
        });
    }

    return groups;
};
