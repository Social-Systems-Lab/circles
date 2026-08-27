import { ObjectId, type Filter } from "mongodb";
import type { Circle } from "@/models/models";
import { getReadableLifecycleQuery } from "./circle-lifecycle-policy";
import { circleVisibilityMongoQuery, getCanonicalMemberCircleIds } from "./circle-visibility-policy";
import {
    parseCircleReferenceOccurrences,
    type CompleteMarkdownLinkOccurrence,
} from "./circle-mention-markdown";

export { findCompleteMarkdownLinkOccurrences, isMarkdownDelimiterEscaped } from "./circle-mention-markdown";
export type { CompleteMarkdownLinkOccurrence } from "./circle-mention-markdown";

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

const rangeKey = ({ start, end }: Pick<CompleteMarkdownLinkOccurrence, "start" | "end">) => `${start}:${end}`;

function parseOccurrences(item: MentionBearingTextItem, exemptRanges: ReadonlySet<string>): Occurrence[] {
    const occurrences: Occurrence[] = [];
    for (const link of parseCircleReferenceOccurrences(item.content)) {
        if (exemptRanges.has(rangeKey(link))) continue;
        occurrences.push(link);
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
