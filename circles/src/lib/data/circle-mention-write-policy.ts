import { ObjectId, type Filter } from "mongodb";
import type { Circle, Mention } from "@/models/models";
import { canReadCircle } from "./circle-visibility-policy";
import {
    canonicalCircleMarkdown,
    hasIncompleteCircleReferenceAttempt,
    parseCircleReferenceOccurrences,
} from "./circle-mention-markdown";

export const CIRCLE_REFERENCE_UNAVAILABLE = "One or more references are unavailable.";

export type CircleMentionWriteResult =
    | { ok: true; content: string; mentions: Mention[] }
    | { ok: false; error: typeof CIRCLE_REFERENCE_UNAVAILABLE };

export type CircleMentionWriteDependencies = {
    findCircles: (input: { objectIds: ObjectId[]; handles: string[] }) => Promise<Circle[]>;
    canReadCircle: (writerDid: string, circle: Circle) => Promise<boolean>;
};

const defaultDependencies: CircleMentionWriteDependencies = {
    findCircles: async ({ objectIds, handles }) => {
        if (objectIds.length === 0 && handles.length === 0) return [];
        const { Circles } = await import("./db");
        const query: Filter<Circle> = {
            $or: [
                ...(objectIds.length ? [{ _id: { $in: objectIds } }] : []),
                ...(handles.length ? [{ handle: { $in: handles } }] : []),
            ],
        };
        return Circles.find(query, {
            projection: { _id: 1, name: 1, handle: 1, circleType: 1, visibility: 1, moderationStatus: 1 },
        }).toArray();
    },
    canReadCircle,
};

const unavailable = (): CircleMentionWriteResult => ({ ok: false, error: CIRCLE_REFERENCE_UNAVAILABLE });

export async function canonicalizeCircleMentionsForWrite(
    content: string,
    writerDid: string,
    dependencies: CircleMentionWriteDependencies = defaultDependencies,
): Promise<CircleMentionWriteResult> {
    if (hasIncompleteCircleReferenceAttempt(content)) return unavailable();

    const occurrences = parseCircleReferenceOccurrences(content);
    if (occurrences.some((occurrence) => !occurrence.identifier)) return unavailable();
    if (occurrences.length === 0) return { ok: true, content, mentions: [] };

    const objectIds = Array.from(new Set(occurrences.flatMap((value) => (value.objectId ? [value.objectId] : []))));
    const handles = Array.from(new Set(occurrences.flatMap((value) => (value.handle ? [value.handle] : []))));
    const circles = await dependencies.findCircles({
        objectIds: objectIds.map((value) => new ObjectId(value)),
        handles,
    });
    const byId = new Map(circles.flatMap((circle) => (circle._id ? [[circle._id.toString(), circle] as const] : [])));
    const byHandle = new Map(circles.flatMap((circle) => (circle.handle ? [[circle.handle, circle] as const] : [])));
    const resolved: Circle[] = [];

    for (const occurrence of occurrences) {
        const circle = occurrence.objectId
            ? byId.get(occurrence.objectId)
            : occurrence.handle
              ? byHandle.get(occurrence.handle)
              : undefined;
        if (!circle?._id || !circle.name || !circle.handle || !(await dependencies.canReadCircle(writerDid, circle))) {
            return unavailable();
        }
        resolved.push(circle);
    }

    let canonicalContent = content;
    for (let index = occurrences.length - 1; index >= 0; index -= 1) {
        const occurrence = occurrences[index];
        const circle = resolved[index];
        canonicalContent = `${canonicalContent.slice(0, occurrence.start)}${canonicalCircleMarkdown({ name: circle.name!, handle: circle.handle! })}${canonicalContent.slice(occurrence.end)}`;
    }

    const seen = new Set<string>();
    const mentions: Mention[] = [];
    for (const circle of resolved) {
        const id = circle._id!.toString();
        if (seen.has(id)) continue;
        seen.add(id);
        mentions.push({ type: "circle", id });
    }
    return { ok: true, content: canonicalContent, mentions };
}
