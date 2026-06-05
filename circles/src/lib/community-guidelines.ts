export const COMMUNITY_GUIDELINE_RULE_IDS = [
    "truth",
    "constructive",
    "respect",
    "privacy",
    "responsibility",
] as const;

export type CommunityGuidelineRuleId = (typeof COMMUNITY_GUIDELINE_RULE_IDS)[number];

export type CommunityGuidelineAgreement = {
    accepted: boolean;
    acceptedAt: Date | null;
};

export type CommunityGuidelineAgreementState = Record<CommunityGuidelineRuleId, CommunityGuidelineAgreement>;

export const COMMUNITY_GUIDELINE_RULES: {
    id: CommunityGuidelineRuleId;
    title: string;
    body: string;
}[] = [
    {
        id: "truth",
        title: "Be truthful",
        body: "I will not share information I have not verified, and I will not knowingly spread false or misleading information.",
    },
    {
        id: "constructive",
        title: "Be constructive",
        body: "I will engage in good faith, focus on ideas rather than attacking people, and aim to move conversations forward.",
    },
    {
        id: "respect",
        title: "Be respectful and inclusive",
        body: "I will treat other users with respect and will not use harassment, insults, slurs, or discriminatory language.",
    },
    {
        id: "privacy",
        title: "Respect privacy",
        body: "I will not share personal or sensitive information about others without their consent.",
    },
    {
        id: "responsibility",
        title: "Act responsibly",
        body: "I will act in good faith, avoid manipulation, spam, scams, or exploitation, and help maintain a healthy community.",
    },
];

export const createEmptyCommunityGuidelineAgreementState = (): CommunityGuidelineAgreementState => ({
    truth: { accepted: false, acceptedAt: null },
    constructive: { accepted: false, acceptedAt: null },
    respect: { accepted: false, acceptedAt: null },
    privacy: { accepted: false, acceptedAt: null },
    responsibility: { accepted: false, acceptedAt: null },
});

export const normalizeCommunityGuidelineAgreementState = (
    input?: Partial<Record<CommunityGuidelineRuleId, Partial<CommunityGuidelineAgreement> | undefined>> | null,
): CommunityGuidelineAgreementState => {
    const nextState = createEmptyCommunityGuidelineAgreementState();

    for (const ruleId of COMMUNITY_GUIDELINE_RULE_IDS) {
        const currentValue = input?.[ruleId];
        const acceptedAtValue = currentValue?.acceptedAt;
        const parsedAcceptedAt =
            acceptedAtValue instanceof Date
                ? acceptedAtValue
                : typeof acceptedAtValue === "string"
                  ? new Date(acceptedAtValue)
                  : null;

        nextState[ruleId] = {
            accepted: Boolean(currentValue?.accepted),
            acceptedAt: parsedAcceptedAt && !Number.isNaN(parsedAcceptedAt.getTime()) ? parsedAcceptedAt : null,
        };
    }

    return nextState;
};

export const isAcceptedCommunityGuidelineRule = (
    input: Partial<CommunityGuidelineAgreement> | CommunityGuidelineAgreement | undefined | null,
): boolean => {
    const acceptedAtValue = input?.acceptedAt;
    const parsedAcceptedAt =
        acceptedAtValue instanceof Date
            ? acceptedAtValue
            : typeof acceptedAtValue === "string"
              ? new Date(acceptedAtValue)
              : null;

    return Boolean(input?.accepted) && parsedAcceptedAt !== null && !Number.isNaN(parsedAcceptedAt.getTime());
};

export const getAcceptedCommunityGuidelineCount = (
    input?: Partial<Record<CommunityGuidelineRuleId, Partial<CommunityGuidelineAgreement> | undefined>> | null,
): number => {
    const normalizedState = normalizeCommunityGuidelineAgreementState(input);
    return COMMUNITY_GUIDELINE_RULE_IDS.filter((ruleId) => isAcceptedCommunityGuidelineRule(normalizedState[ruleId]))
        .length;
};

export const hasAcceptedAllCommunityGuidelines = (
    input?: Partial<Record<CommunityGuidelineRuleId, Partial<CommunityGuidelineAgreement> | undefined>> | null,
): boolean => {
    return getAcceptedCommunityGuidelineCount(input) === COMMUNITY_GUIDELINE_RULE_IDS.length;
};

export const isCommunityGuidelinesCompleted = (
    input?: Partial<Record<CommunityGuidelineRuleId, Partial<CommunityGuidelineAgreement> | undefined>> | null,
): boolean => {
    return hasAcceptedAllCommunityGuidelines(input);
};
