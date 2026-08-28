export type ParsedInternalPreviewRoute = {
    type: "circle" | "post" | "task" | "event" | "goal" | "issue" | "proposal" | "funding";
    id: string;
};

const HANDLE = "[a-zA-Z0-9-]{1,20}";
const OBJECT_ID = "[a-f0-9]{24}";
const CIRCLE_ROUTE = new RegExp(`^/circles/(${HANDLE})$`);
const RESOURCE_ROUTE = new RegExp(
    `^/circles/${HANDLE}/(post|tasks|shifts|events|goals|issues|proposals|funding)/(${OBJECT_ID})$`,
);

export function parseCanonicalInternalPreviewRoute(url: string): ParsedInternalPreviewRoute | null {
    const circle = url.match(CIRCLE_ROUTE);
    if (circle) return { type: "circle", id: circle[1] };

    const resource = url.match(RESOURCE_ROUTE);
    if (!resource) return null;
    const typeBySegment = {
        post: "post",
        tasks: "task",
        shifts: "task",
        events: "event",
        goals: "goal",
        issues: "issue",
        proposals: "proposal",
        funding: "funding",
    } as const;
    return {
        type: typeBySegment[resource[1] as keyof typeof typeBySegment],
        id: resource[2].toLowerCase(),
    };
}

export const isCanonicalInternalPreviewRoute = (url: string): boolean =>
    parseCanonicalInternalPreviewRoute(url) !== null;
