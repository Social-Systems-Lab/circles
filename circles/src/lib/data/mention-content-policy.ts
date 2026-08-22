import { ObjectId, type Filter } from "mongodb";
import type { Circle } from "@/models/models";
import { getReadableLifecycleQuery } from "./circle-lifecycle-policy";
import { circleVisibilityMongoQuery, getCanonicalMemberCircleIds } from "./circle-visibility-policy";

export type MentionBearingTextItem = {
    content: string;
    mentions?: unknown;
    mentionsDisplay?: unknown;
};

export type MentionContentPolicyDependencies = {
    findReadableCircles: (input: {
        objectIds: ObjectId[];
        handles: string[];
        viewerDid?: string;
    }) => Promise<Circle[]>;
};

export type MentionContentPolicyOptions = {
    exemptRangesByItem?: ReadonlyMap<MentionBearingTextItem, ReadonlySet<string>>;
};

export type CompleteMarkdownLinkOccurrence = {
    start: number;
    end: number;
    target: string;
};

type Occurrence = {
    start: number;
    end: number;
    identifier: string | null;
    objectId?: string;
    handle?: string;
};

const defaultDependencies: MentionContentPolicyDependencies = {
    findReadableCircles: async ({ objectIds, handles, viewerDid }) => {
        if (objectIds.length === 0 && handles.length === 0) return [];
        const { Circles } = await import("./db");
        const memberCircleIds = await getCanonicalMemberCircleIds(viewerDid);
        const referenceQuery: Filter<Circle> = {
            $or: [
                ...(objectIds.length ? [{ _id: { $in: objectIds } }] : []),
                ...(handles.length ? [{ handle: { $in: handles } }] : []),
            ],
        };
        return Circles.find(
            {
                $and: [
                    referenceQuery,
                    circleVisibilityMongoQuery({ viewerDid, memberCircleIds }),
                    getReadableLifecycleQuery(),
                ],
            },
            { projection: { _id: 1, name: 1, handle: 1, circleType: 1, visibility: 1, moderationStatus: 1 } },
        ).toArray();
    },
};

export function isMarkdownDelimiterEscaped(content: string, index: number): boolean {
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && content[cursor] === "\\"; cursor -= 1) backslashes += 1;
    return backslashes % 2 === 1;
}

function findUnescapedDelimiter(content: string, delimiter: string, start: number): number {
    for (let cursor = start; cursor < content.length; cursor += 1) {
        if (content[cursor] === "\r" || content[cursor] === "\n") return -1;
        if (content[cursor] === delimiter && !isMarkdownDelimiterEscaped(content, cursor)) return cursor;
    }
    return -1;
}

export function findCompleteMarkdownLinkOccurrences(content: string): CompleteMarkdownLinkOccurrence[] {
    const occurrences: CompleteMarkdownLinkOccurrence[] = [];
    for (let start = 0; start < content.length; start += 1) {
        if (content[start] !== "[" || isMarkdownDelimiterEscaped(content, start)) continue;
        if (start > 0 && content[start - 1] === "!" && !isMarkdownDelimiterEscaped(content, start - 1)) continue;

        const labelEnd = findUnescapedDelimiter(content, "]", start + 1);
        if (labelEnd < 0 || content[labelEnd + 1] !== "(") continue;
        const destinationStart = labelEnd + 2;
        let target: string;
        let destinationEnd: number;
        if (content[destinationStart] === "<") {
            const angleEnd = findUnescapedDelimiter(content, ">", destinationStart + 1);
            if (angleEnd < 0 || content[angleEnd + 1] !== ")") continue;
            target = content.slice(destinationStart + 1, angleEnd);
            destinationEnd = angleEnd + 1;
        } else {
            destinationEnd = findUnescapedDelimiter(content, ")", destinationStart);
            if (destinationEnd < 0) continue;
            target = content.slice(destinationStart, destinationEnd);
        }
        occurrences.push({ start, end: destinationEnd + 1, target });
        start = destinationEnd;
    }
    return occurrences;
}

function classifyCircleReference(target: string): Omit<Occurrence, "start" | "end"> | null {
    if (!target.startsWith("/circles/")) return null;
    const encodedIdentifier = target.slice("/circles/".length);
    if (
        !encodedIdentifier ||
        encodedIdentifier.includes("/") ||
        encodedIdentifier.includes("?") ||
        encodedIdentifier.includes("#") ||
        /\s/.test(target)
    ) {
        return { identifier: null };
    }
    let identifier: string;
    try {
        identifier = decodeURIComponent(encodedIdentifier);
    } catch {
        return { identifier: null };
    }
    if (!identifier || identifier.includes("/") || identifier.includes("?") || identifier.includes("#") || /\s/.test(identifier)) {
        return { identifier: null };
    }
    if (ObjectId.isValid(identifier)) {
        const objectId = new ObjectId(identifier).toHexString();
        return { identifier, objectId };
    }
    return { identifier, handle: identifier };
}

const rangeKey = ({ start, end }: Pick<CompleteMarkdownLinkOccurrence, "start" | "end">) => `${start}:${end}`;

function parseOccurrences(item: MentionBearingTextItem, exemptRanges: ReadonlySet<string>): Occurrence[] {
    const occurrences: Occurrence[] = [];
    for (const link of findCompleteMarkdownLinkOccurrences(item.content)) {
        if (exemptRanges.has(rangeKey(link))) continue;
        const classified = classifyCircleReference(link.target);
        if (!classified) continue;
        occurrences.push({ start: link.start, end: link.end, ...classified });
    }
    return occurrences;
}

function canonicalMarkdown(circle: Circle | undefined): string {
    return circle?.name && circle.handle ? `[${circle.name}](/circles/${circle.handle})` : "Unavailable Circle";
}

export async function sanitizeCircleMentionsInTextItems<T extends MentionBearingTextItem>(
    items: readonly T[],
    viewerDid?: string,
    dependencies: MentionContentPolicyDependencies = defaultDependencies,
    options: MentionContentPolicyOptions = {},
): Promise<T[]> {
    const parsed = items.map((item) =>
        parseOccurrences(item, options.exemptRangesByItem?.get(item) ?? new Set<string>()),
    );
    const objectIds = Array.from(new Set(parsed.flat().flatMap((value) => (value.objectId ? [value.objectId] : []))));
    const handles = Array.from(new Set(parsed.flat().flatMap((value) => (value.handle ? [value.handle] : []))));
    const circles =
        objectIds.length || handles.length
            ? await dependencies.findReadableCircles({
                  objectIds: objectIds.map((value) => new ObjectId(value)),
                  handles,
                  viewerDid,
              })
            : [];
    const byId = new Map(circles.flatMap((circle) => (circle._id ? [[circle._id.toString(), circle] as const] : [])));
    const byHandle = new Map(circles.flatMap((circle) => (circle.handle ? [[circle.handle, circle] as const] : [])));

    return items.map((item, index) => {
        let content = item.content;
        for (const occurrence of parsed[index].slice().reverse()) {
            const circle = occurrence.objectId
                ? byId.get(occurrence.objectId)
                : occurrence.handle
                  ? byHandle.get(occurrence.handle)
                  : undefined;
            content = `${content.slice(0, occurrence.start)}${canonicalMarkdown(circle)}${content.slice(occurrence.end)}`;
        }
        const sanitized = { ...item, content };
        delete sanitized.mentions;
        delete sanitized.mentionsDisplay;
        return sanitized;
    });
}
