# Kamooni Skills Taxonomy v1

## Core model

Kamooni should evolve from a flat skills list to a structured model:

- Category
- Skill
- Level

Example:

- Technology & Digital
  - Web Development
  - Backend Development
  - UX Design

Levels:

- Beginner
- Intermediate
- Advanced
- Professional

---

## Proposed top-level categories

1. Governance & Leadership
2. Community & Movement Building
3. Policy, Law & Advocacy
4. Communications & Media
5. Technology & Digital
6. Creative & Design
7. Research & Analysis
8. Education & Capacity Building
9. Health & Wellbeing
10. Environment & Sustainability
11. Operations & Project Delivery
12. Finance & Fundraising
13. International Development
14. Local & Practical Skills

---

## Mapping the current repo skills into categories

### Governance & Leadership
- Leadership
- Strategic Planning
- Negotiation
- Conflict Resolution
- Facilitation & Mediation
- Project Management

### Community & Movement Building
- Community Organizing
- Volunteer Management
- Campaign Management
- Public Speaking
- Cross-Cultural Communication

### Policy, Law & Advocacy
- Policy Analysis
- Advocacy
- Lobbying & Government Relations
- Legal Expertise
- International Relations
- Gender Studies

### Communications & Media
- Media Relations
- Social Media Management
- Journalism
- Marketing & Communications
- Translation & Interpretation
- Graphic Design & Visual Communication

### Technology & Digital
- Web Development & Technology

### Research & Analysis
- Data Analysis & Research
- Economics

### Education & Capacity Building
- Education & Training

### Health & Wellbeing
- Healthcare Management
- Mental Health Support
- Disaster Response & Humanitarian Aid

### Environment & Sustainability
- Environmental Science
- Sustainable Development

### Operations & Project Delivery
- Event Planning

### Finance & Fundraising
- Fundraising
- Grant Writing

---

## Next expansion principle

Each category should later be expanded into more specific skills.

Example:

### Technology & Digital
- Web Development
- Frontend Development
- Backend Development
- Mobile App Development
- UX Design
- UI Design
- API Development
- Database Design
- DevOps
- Cybersecurity
- Data Science
- AI / Machine Learning
- GIS Mapping
- Open Source Development

### Finance & Fundraising
- Fundraising
- Grant Writing
- Donor Relations
- Budgeting
- Accounting
- Crowdfunding
- Impact Investing

### Community & Movement Building
- Community Organizing
- Volunteer Coordination
- Coalition Building
- Community Outreach
- Grassroots Mobilization
- Participatory Facilitation
- Civic Engagement
- Peer Support

---

## Recommended future data shape

```ts
type SkillLevel = "beginner" | "intermediate" | "advanced" | "professional";

type SkillCategory =
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

type Skill = {
  handle: string;
  name: string;
  description: string;
  picture?: { url: string };
  category: SkillCategory;
};

type UserSkill = {
  handle: string;
  level: SkillLevel;
};


---

## Implementation strategy

1. Keep the current `src/lib/data/skills.ts` working.
2. Add category metadata to each existing skill.
3. Add optional user skill levels later.
4. Expand the skills list gradually.
5. Update onboarding UI after the taxonomy is stable.
