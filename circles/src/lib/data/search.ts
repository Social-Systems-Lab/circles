import { Circle, CircleType, WithMetric } from "@/models/models";
import { Circles } from "./db";
import { SAFE_CIRCLE_PROJECTION } from "./circle";

const SEARCHABLE_TYPES: CircleType[] = ["circle", "project", "user"];
const SEARCHABLE_FIELDS = [
    "name",
    "handle",
    "description",
    "mission",
    "content",
    "skills",
    "interests",
    "causes",
    "offers.text",
    "offers.skills",
    "engagements.text",
    "engagements.interests",
    "needs.text",
    "needs.tags",
    "location.city",
    "location.region",
    "location.country",
] as const;

type SearchCirclesOptions = {
    query?: string;
    limit?: number;
    circleTypes?: CircleType[];
    sdgHandles?: string[];
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeValue = (value?: string | null) => (value || "").trim().toLowerCase();

const tokenizeQuery = (query: string) =>
    Array.from(
        new Set(
            normalizeValue(query)
                .replace(/^@/, "")
                .split(/[^a-z0-9]+/i)
                .filter((token) => token.length > 1),
        ),
    );

const toStringArray = (values?: string[]) => (values || []).map((value) => normalizeValue(value)).filter(Boolean);

const isDiscoverableCircle = (circle: Circle) =>
    circle.circleType !== "user" || Boolean(circle.isVerified || circle.isMember);

const matchesCircleTypes = (circle: Circle, circleTypes: CircleType[]) =>
    !!circle.circleType && circleTypes.includes(circle.circleType);

const getLocationTerms = (circle: Circle) =>
    [circle.location?.city, circle.location?.region, circle.location?.country].map((value) => normalizeValue(value));

const getExactTerms = (circle: Circle) => ({
    handle: normalizeValue(circle.handle),
    name: normalizeValue(circle.name),
});

const getStructuredTerms = (circle: Circle) =>
    [
        ...toStringArray(circle.skills),
        ...toStringArray(circle.interests),
        ...toStringArray(circle.causes),
        ...toStringArray(circle.offers?.skills),
        ...toStringArray(circle.engagements?.interests),
        ...toStringArray(circle.needs?.tags),
        ...getLocationTerms(circle),
    ].filter(Boolean);

const getLongTextTerms = (circle: Circle) =>
    [
        circle.description,
        circle.mission,
        circle.content,
        circle.offers?.text,
        circle.engagements?.text,
        circle.needs?.text,
    ]
        .map((value) => normalizeValue(value))
        .filter(Boolean);

const scoreQueryAgainstValues = (query: string, tokens: string[], values: string[], weights: { exact: number; prefix: number; contains: number }) => {
    let score = 0;

    for (const value of values) {
        if (!value) continue;

        if (query && value === query) {
            score += weights.exact;
        } else if (query && value.startsWith(query)) {
            score += weights.prefix;
        } else if (query && value.includes(query)) {
            score += weights.contains;
        }

        for (const token of tokens) {
            if (value === token) {
                score += Math.round(weights.exact * 0.55);
            } else if (value.startsWith(token)) {
                score += Math.round(weights.prefix * 0.45);
            } else if (value.includes(token)) {
                score += Math.round(weights.contains * 0.35);
            }
        }
    }

    return score;
};

const scoreCircleSearchMatch = (circle: Circle, query: string, tokens: string[]) => {
    if (!query && tokens.length === 0) {
        return 1;
    }

    const exactTerms = getExactTerms(circle);
    const structuredTerms = getStructuredTerms(circle);
    const longTextTerms = getLongTextTerms(circle);

    let score = 0;
    score += scoreQueryAgainstValues(query, tokens, [exactTerms.name], { exact: 120, prefix: 96, contains: 70 });
    score += scoreQueryAgainstValues(query, tokens, [exactTerms.handle], { exact: 112, prefix: 90, contains: 64 });
    score += scoreQueryAgainstValues(query, tokens, structuredTerms, { exact: 70, prefix: 48, contains: 30 });
    score += scoreQueryAgainstValues(query, tokens, longTextTerms, { exact: 42, prefix: 24, contains: 14 });

    if (circle.circleType === "user") {
        score += 3;
    }

    return score;
};

const buildCandidateQuery = (query: string, circleTypes: CircleType[], sdgHandles: string[]) => {
    const discoverableTypeClauses: Record<string, unknown>[] = [];
    const nonUserTypes = circleTypes.filter((type) => type !== "user");

    if (nonUserTypes.length > 0) {
        discoverableTypeClauses.push({ circleType: { $in: nonUserTypes } });
    }

    if (circleTypes.includes("user")) {
        discoverableTypeClauses.push({
            $and: [{ circleType: "user" }, { $or: [{ isVerified: true }, { isMember: true }] }],
        });
    }

    const clauses: Record<string, unknown>[] = [
        {
            $or: discoverableTypeClauses,
        },
    ];

    if (sdgHandles.length > 0) {
        clauses.push({ causes: { $in: sdgHandles } });
    }

    if (query) {
        const tokens = [query, ...tokenizeQuery(query)].filter(Boolean);
        const regexes = tokens.map((token) => new RegExp(escapeRegex(token), "i"));
        clauses.push({
            $or: regexes.flatMap((regex) => SEARCHABLE_FIELDS.map((field) => ({ [field]: regex }))),
        });
    }

    return clauses.length === 1 ? clauses[0] : { $and: clauses };
};

export const searchDiscoverableCircles = async ({
    query = "",
    limit = 20,
    circleTypes = SEARCHABLE_TYPES,
    sdgHandles = [],
}: SearchCirclesOptions): Promise<WithMetric<Circle>[]> => {
    const normalizedQuery = normalizeValue(query);
    const normalizedTypes = circleTypes.length > 0 ? circleTypes : SEARCHABLE_TYPES;
    const normalizedSdgs = sdgHandles.map((handle) => normalizeValue(handle)).filter(Boolean);
    const candidateLimit = Math.max(limit * 6, 120);
    const candidateQuery = buildCandidateQuery(normalizedQuery, normalizedTypes, normalizedSdgs);

    const circles = (await Circles.find(candidateQuery, { projection: SAFE_CIRCLE_PROJECTION }).limit(candidateLimit).toArray()) as Circle[];
    const tokens = tokenizeQuery(normalizedQuery);

    const scored = circles
        .map((circle) => {
            if (circle._id) {
                circle._id = circle._id.toString();
            }

            const score = scoreCircleSearchMatch(circle, normalizedQuery, tokens);
            return { circle, score };
        })
        .filter(({ circle, score }) => {
            if (!circle._id || !isDiscoverableCircle(circle) || !matchesCircleTypes(circle, normalizedTypes)) {
                return false;
            }

            if (normalizedSdgs.length > 0 && !circle.causes?.some((cause) => normalizedSdgs.includes(normalizeValue(cause)))) {
                return false;
            }

            return normalizedQuery ? score > 0 : true;
        })
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }

            const membersDiff = (right.circle.members || 0) - (left.circle.members || 0);
            if (membersDiff !== 0) {
                return membersDiff;
            }

            return (right.circle.createdAt?.getTime() || 0) - (left.circle.createdAt?.getTime() || 0);
        })
        .slice(0, limit);

    const maxScore = scored[0]?.score || 1;

    return scored.map(({ circle, score }) => ({
        ...circle,
        metrics: {
            searchRank: score / maxScore,
            similarity: score / maxScore,
        },
    }));
};
