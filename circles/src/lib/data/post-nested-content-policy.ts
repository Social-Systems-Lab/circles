import { ObjectId } from "mongodb";
import type { Circle, Event, FundingAsk, Goal, InternalPreviewData, Issue, PostDisplay, Proposal, SharedOriginalPreview, Task } from "@/models/models";
import { getReadableLifecycleQuery } from "./circle-lifecycle-policy";
import { circleVisibilityMongoQuery, getCanonicalMemberCircleIds } from "./circle-visibility-policy";
import { resolveReadablePostContext, type ReadablePostContext } from "./post-access-policy";

export const INTERNAL_PREVIEW_TYPES = [
    "circle",
    "post",
    "task",
    "event",
    "goal",
    "issue",
    "proposal",
    "funding",
] as const;

export type InternalPreviewType = (typeof INTERNAL_PREVIEW_TYPES)[number];
type PreviewResource = Circle | Task | Event | Goal | Issue | Proposal | FundingAsk;

export type ResolvedInternalPreview = {
    type: InternalPreviewType;
    id: string;
    url: string;
    data: InternalPreviewData;
};

export type InternalPreviewActionResult = ResolvedInternalPreview | { error: "Preview unavailable" };

type InternalPreviewActionDependencies = {
    getViewerDid: () => Promise<string | undefined>;
    resolvePreview?: (url: string, viewerDid: string) => Promise<ResolvedInternalPreview | null>;
};

type NestedContentDependencies = {
    findResources: (
        type: Exclude<InternalPreviewType, "circle" | "post">,
        ids: ObjectId[],
    ) => Promise<PreviewResource[]>;
    findCirclesByHandles: (handles: string[]) => Promise<Circle[]>;
    findReadableCircles: (ids: ObjectId[], viewerDid?: string) => Promise<Circle[]>;
    findAuthors: (dids: string[]) => Promise<Circle[]>;
    resolvePost: (postId: string, viewerDid?: string) => Promise<ReadablePostContext | null>;
};

export const MAX_SHARED_POST_DEPTH = 1;

const minimalCircleProjection = {
    _id: 1,
    did: 1,
    name: 1,
    handle: 1,
    picture: 1,
    description: 1,
    mission: 1,
    circleType: 1,
    visibility: 1,
    moderationStatus: 1,
} as const;

const resourceProjections = {
    task: { _id: 1, circleId: 1, title: 1, taskType: 1, stage: 1, images: 1, assignedTo: 1 },
    event: { _id: 1, circleId: 1, hostCircleIds: 1, title: 1, startAt: 1, images: 1 },
    goal: { _id: 1, circleId: 1, title: 1, stage: 1, description: 1, images: 1 },
    issue: { _id: 1, circleId: 1, title: 1, stage: 1, assignedTo: 1 },
    proposal: { _id: 1, circleId: 1, name: 1, stage: 1, outcome: 1 },
    funding: { _id: 1, circleId: 1, title: 1, shortStory: 1, status: 1, coverImage: 1, items: 1 },
} as const;

const defaultDependencies: NestedContentDependencies = {
    findResources: async (type, ids) => {
        const { Tasks, Events, Goals, Issues, Proposals, FundingAsks } = await import("./db");
        const collections = {
            task: Tasks,
            event: Events,
            goal: Goals,
            issue: Issues,
            proposal: Proposals,
            funding: FundingAsks,
        };
        return collections[type]
            .find({ _id: { $in: ids } } as never, { projection: resourceProjections[type] as never })
            .toArray() as Promise<PreviewResource[]>;
    },
    findCirclesByHandles: async (handles) => {
        const { Circles } = await import("./db");
        return Circles.find({ handle: { $in: handles } }, { projection: minimalCircleProjection }).toArray();
    },
    findReadableCircles: async (ids, viewerDid) => {
        if (ids.length === 0) return [];
        const { Circles } = await import("./db");
        const memberCircleIds = await getCanonicalMemberCircleIds(viewerDid);
        return Circles.find(
            {
                $and: [
                    { _id: { $in: ids } },
                    circleVisibilityMongoQuery({ viewerDid, memberCircleIds }),
                    getReadableLifecycleQuery(),
                ],
            },
            { projection: minimalCircleProjection },
        ).toArray();
    },
    findAuthors: async (dids) => {
        if (dids.length === 0) return [];
        const { Circles } = await import("./db");
        return Circles.find({ did: { $in: dids } }, { projection: minimalCircleProjection }).toArray();
    },
    resolvePost: resolveReadablePostContext,
};

const normalizeObjectId = (value: unknown): string | null =>
    typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value).toHexString() : null;

const unique = <T>(values: T[]) => Array.from(new Set(values));
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function loadPreviewBatch<T>(type: string, count: number, load: () => Promise<T[]>): Promise<T[]> {
    try {
        return await load();
    } catch {
        console.error(`Nested preview hydration failed for ${type} batch`, { count });
        return [];
    }
}

function getOwnerCircleIds(type: Exclude<InternalPreviewType, "circle" | "post">, resource: PreviewResource) {
    const primary = normalizeObjectId((resource as Exclude<PreviewResource, Circle>).circleId);
    if (!primary) return null;
    if (type !== "event") return [primary];
    const rawHosts: unknown = (resource as Event).hostCircleIds;
    if (rawHosts !== undefined && rawHosts !== null && !Array.isArray(rawHosts)) return null;
    const hosts = (rawHosts ?? []) as unknown[];
    const normalizedHosts = hosts.map(normalizeObjectId);
    if (normalizedHosts.some((id) => !id)) return null;
    return unique([primary, ...(normalizedHosts as string[])]);
}

function getCanonicalPreviewUrl(
    type: InternalPreviewType,
    id: string,
    resource: PreviewResource | ReadablePostContext,
    owner?: Circle,
) {
    if (type === "circle") return `/circles/${(resource as Circle).handle}`;
    if (type === "post") {
        const context = resource as ReadablePostContext;
        return context.circle.handle ? `/circles/${context.circle.handle}/post/${id}` : undefined;
    }
    if (!owner?.handle) return undefined;
    const segment =
        type === "task" && (resource as Task).taskType === "shift"
            ? "shifts"
            : (
                  {
                      task: "tasks",
                      event: "events",
                      goal: "goals",
                      issue: "issues",
                      proposal: "proposals",
                      funding: "funding",
                  } as const
              )[type];
    return `/circles/${owner.handle}/${segment}/${id}`;
}

function getSafeCircle(circle: Circle): InternalPreviewData {
    return {
        name: circle.name ?? "",
        picture: circle.picture,
        description: circle.description,
        mission: circle.mission,
        circleType: circle.circleType,
    };
}

function getSafeResource(type: Exclude<InternalPreviewType, "circle" | "post">, resource: PreviewResource) {
    switch (type) {
        case "task": {
            const value = resource as Task;
            return { title: value.title, taskType: value.taskType, stage: value.stage, images: value.images };
        }
        case "event": {
            const value = resource as Event;
            return { title: value.title, startAt: value.startAt, images: value.images };
        }
        case "goal": {
            const value = resource as Goal;
            return {
                title: value.title,
                stage: value.stage,
                description: value.description,
                images: value.images,
            };
        }
        case "issue": {
            const value = resource as Issue;
            return { title: value.title, stage: value.stage };
        }
        case "proposal": {
            const value = resource as Proposal;
            return { name: value.name, stage: value.stage, outcome: value.outcome };
        }
        case "funding": {
            const value = resource as FundingAsk;
            return {
                title: value.title,
                shortStory: value.shortStory,
                status: value.status,
                coverImage: value.coverImage,
                items: value.items?.map(({ status, price, currency, quantity }) => ({
                    status,
                    price,
                    currency,
                    quantity,
                })),
            };
        }
    }
}

function rewritePreviewToken(post: PostDisplay, replacement?: { url: string }): string {
    const url = post.internalPreviewUrl;
    if (!url) return post.content;
    const candidates = new Set([url]);
    try {
        const parsed = new URL(url, "http://internal.invalid");
        candidates.add(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    } catch {
        // The persisted value is still removed from structured output below.
    }
    const markdownPattern = /\[([^\]]*)\]\(([^)\s]+)\)/g;
    let content = post.content.replace(markdownPattern, (token, label: string, target: string) => {
        if (!candidates.has(target)) return token;
        return replacement ? `[${label}](${replacement.url})` : "Unavailable content";
    });
    for (const candidate of candidates) {
        if (!candidate) continue;
        const bareTokenPattern = new RegExp(
            `(^|[\\s\\(\\[\\{\"'])${escapeRegExp(candidate)}(?=$|[\\s,\\.!?;:\\)\\]\\}\"'])`,
            "g",
        );
        content = content.replace(bareTokenPattern, `$1${replacement ? replacement.url : "Unavailable content"}`);
    }
    return content;
}

function stripPreview(post: PostDisplay): PostDisplay {
    const sanitized = { ...post, content: rewritePreviewToken(post) };
    delete sanitized.internalPreviewType;
    delete sanitized.internalPreviewId;
    delete sanitized.internalPreviewUrl;
    delete sanitized.internalPreviewData;
    return sanitized;
}

async function sanitizeInternalPreviews(
    posts: PostDisplay[],
    viewerDid?: string,
    dependencies: NestedContentDependencies = defaultDependencies,
): Promise<PostDisplay[]> {
    const output = posts.map((post) => ({ ...post }));
    const referenced = output.filter(
        (post) =>
            post.internalPreviewType !== undefined ||
            post.internalPreviewId !== undefined ||
            post.internalPreviewUrl !== undefined ||
            post.internalPreviewData !== undefined,
    );
    if (referenced.length === 0) return output;

    const validReferences = referenced.filter(
        (post): post is PostDisplay & { internalPreviewType: InternalPreviewType; internalPreviewId: string } =>
            INTERNAL_PREVIEW_TYPES.includes(post.internalPreviewType as InternalPreviewType) &&
            typeof post.internalPreviewId === "string" &&
            post.internalPreviewId.length > 0,
    );
    const readableData = new Map<string, { data: PostDisplay["internalPreviewData"]; id: string; url: string }>();

    const circleHandles = unique(
        validReferences.filter((post) => post.internalPreviewType === "circle").map((post) => post.internalPreviewId),
    );
    const circleResources = circleHandles.length
        ? await loadPreviewBatch("circle", circleHandles.length, () => dependencies.findCirclesByHandles(circleHandles))
        : [];

    const idsByType = new Map<Exclude<InternalPreviewType, "circle" | "post">, string[]>();
    for (const type of INTERNAL_PREVIEW_TYPES) {
        if (type === "circle" || type === "post") continue;
        idsByType.set(
            type,
            unique(
                validReferences
                    .filter((post) => post.internalPreviewType === type)
                    .map((post) => normalizeObjectId(post.internalPreviewId))
                    .filter((id): id is string => Boolean(id)),
            ),
        );
    }
    const resourceEntries = await Promise.all(
        Array.from(idsByType.entries()).map(
            async ([type, ids]) =>
                [
                    type,
                    ids.length
                        ? await loadPreviewBatch(type, ids.length, () =>
                              dependencies.findResources(
                                  type,
                                  ids.map((id) => new ObjectId(id)),
                              ),
                          )
                        : [],
                ] as const,
        ),
    );

    const postIds = unique(
        validReferences
            .filter((post) => post.internalPreviewType === "post")
            .map((post) => normalizeObjectId(post.internalPreviewId))
            .filter((id): id is string => Boolean(id)),
    );
    const postContexts = await loadPreviewBatch("post", postIds.length, () =>
        Promise.all(postIds.map((id) => dependencies.resolvePost(id, viewerDid))),
    );
    const contextById = new Map(
        postContexts
            .filter((context): context is ReadablePostContext => Boolean(context))
            .map((context) => [context.post._id!.toString(), context]),
    );

    const ownersByResource = new Map<string, string[] | null>();
    const resourcesByKey = new Map<string, PreviewResource>();
    for (const circle of circleResources) {
        const id = normalizeObjectId(circle._id?.toString());
        if (!id || !circle.handle) continue;
        resourcesByKey.set(`circle:${circle.handle}`, circle);
        ownersByResource.set(`circle:${circle.handle}`, [id]);
    }
    for (const [type, resources] of resourceEntries) {
        for (const resource of resources) {
            const id = normalizeObjectId(resource._id?.toString());
            if (!id) continue;
            resourcesByKey.set(`${type}:${id}`, resource);
            ownersByResource.set(`${type}:${id}`, getOwnerCircleIds(type, resource));
        }
    }

    const allOwnerIds = unique(Array.from(ownersByResource.values()).flatMap((ids) => ids ?? []));
    const readableCircles = await loadPreviewBatch("owner", allOwnerIds.length, () =>
        dependencies.findReadableCircles(
            allOwnerIds.map((id) => new ObjectId(id)),
            viewerDid,
        ),
    );
    const readableCircleMap = new Map(
        readableCircles.map((circle) => [new ObjectId(circle._id!.toString()).toHexString(), circle]),
    );

    const authorDids = unique(Array.from(contextById.values()).map((context) => context.post.createdBy));
    const authors = await loadPreviewBatch("post-author", authorDids.length, () =>
        dependencies.findAuthors(authorDids),
    );
    const authorByDid = new Map(
        authors.map((author) => [author.did, { name: author.name, picture: author.picture }]),
    );

    for (const post of validReferences) {
        const type = post.internalPreviewType;
        if (type === "post") {
            const id = normalizeObjectId(post.internalPreviewId);
            const context = id ? contextById.get(id) : undefined;
            const author = context ? authorByDid.get(context.post.createdBy) : undefined;
            const url = context && id ? getCanonicalPreviewUrl(type, id, context) : undefined;
            if (id && context && author && url) {
                const sourceDisplay = { ...context.post, author, circleType: "post" } as PostDisplay;
                const sourceContent =
                    sourceDisplay.internalPreviewType ||
                    sourceDisplay.internalPreviewId ||
                    sourceDisplay.internalPreviewUrl
                        ? stripPreview(sourceDisplay).content
                        : sourceDisplay.content;
                readableData.set(`${type}:${post.internalPreviewId}`, {
                    id,
                    url,
                    data: { content: sourceContent, author } as PostDisplay,
                });
            }
            continue;
        }

        const lookupId = type === "circle" ? post.internalPreviewId : normalizeObjectId(post.internalPreviewId);
        if (!lookupId) continue;
        const key = `${type}:${lookupId}`;
        const resource = resourcesByKey.get(key);
        const ownerIds = ownersByResource.get(key);
        if (!resource || !ownerIds?.length || ownerIds.some((ownerId) => !readableCircleMap.has(ownerId))) continue;
        const primaryOwner = readableCircleMap.get(ownerIds[0]);
        const url = getCanonicalPreviewUrl(type, lookupId, resource, primaryOwner);
        if (!url) continue;
        readableData.set(`${type}:${post.internalPreviewId}`, {
            id: type === "circle" ? (resource as Circle).handle! : lookupId,
            url,
            data:
                type === "circle"
                    ? getSafeCircle(resource as Circle)
                    : (getSafeResource(type, resource) as PostDisplay["internalPreviewData"]),
        });
    }

    return output.map((post) => {
        if (!referenced.includes(post)) return post;
        const preview =
            post.internalPreviewType && post.internalPreviewId
                ? readableData.get(`${post.internalPreviewType}:${post.internalPreviewId}`)
                : undefined;
        if (!preview) return stripPreview(post);
        return {
            ...post,
            content: rewritePreviewToken(post, {
                url: preview.url,
            }),
            internalPreviewType: post.internalPreviewType,
            internalPreviewId: preview.id,
            internalPreviewUrl: preview.url,
            internalPreviewData: preview.data,
        };
    });
}

function sharedOriginalImage(post: PostDisplay): SharedOriginalPreview["image"] {
    const media = post.media?.[0];
    if (media?.fileInfo?.url) return { url: media.fileInfo.url, alt: media.name || post.title };
    if (
        post.internalPreviewType === "funding" &&
        post.internalPreviewData &&
        "coverImage" in post.internalPreviewData &&
        post.internalPreviewData.coverImage?.url
    ) {
        return { url: post.internalPreviewData.coverImage.url, alt: post.title };
    }
    return undefined;
}

async function sanitizeSharedOriginals(
    posts: PostDisplay[], viewerDid: string | undefined, dependencies: NestedContentDependencies,
    depth: number, maxDepth: number,
): Promise<PostDisplay[]> {
    const ids = unique(posts.map((post) => normalizeObjectId(post.sharedPostId)).filter((id): id is string => Boolean(id)));
    const resolved = depth < maxDepth && ids.length
        ? await loadPreviewBatch("shared-post", ids.length, () => Promise.all(ids.map((id) => dependencies.resolvePost(id, viewerDid))))
        : [];
    const contexts = new Map(
        resolved.flatMap((context) => {
            const id = context ? normalizeObjectId(context.post._id?.toString()) : null;
            return id && context ? [[id, context] as const] : [];
        }),
    );
    const authorDids = unique(Array.from(contexts.values()).map(({ post }) => post.createdBy));
    const authors = authorDids.length
        ? await loadPreviewBatch("shared-post-author", authorDids.length, () => dependencies.findAuthors(authorDids))
        : [];
    const authorsByDid = new Map(authors.map((author) => [author.did, author]));
    const originalDisplays = Array.from(contexts.entries()).flatMap(([id, context]) => {
        const author = authorsByDid.get(context.post.createdBy);
        return author
            ? [[id, { ...context.post, author, circle: context.circle, feed: context.feed, circleType: "post" } as PostDisplay] as const]
            : [];
    });
    const previewSafeOriginals = await sanitizeInternalPreviews(originalDisplays.map(([, post]) => post), viewerDid, dependencies);
    const originalsById = new Map(previewSafeOriginals.map((post, index) => [originalDisplays[index][0], post]));

    return posts.map((post) => {
        const hadShare = post.sharedPostId !== undefined;
        const id = normalizeObjectId(post.sharedPostId);
        const ownId = normalizeObjectId(post._id?.toString());
        const original = id && id !== ownId && depth < maxDepth ? originalsById.get(id) : undefined;
        const sanitized = { ...post };
        delete sanitized.sharedPostId;
        delete sanitized.sharedPostData;
        if (!hadShare) return sanitized;
        if (!original) return { ...sanitized, sharedPostData: null };

        const preview: SharedOriginalPreview = {
            content: original.content,
            title: original.title,
            author: { name: original.author.name ?? "", pictureUrl: original.author.picture?.url },
            circleName: original.circle?.name,
            image: sharedOriginalImage(original),
            href: original.circle?.handle ? `/circles/${original.circle.handle}/post/${id}` : undefined,
        };
        return { ...sanitized, sharedPostData: preview };
    });
}

export async function sanitizePostNestedContent(
    posts: PostDisplay[], viewerDid?: string, dependencies: NestedContentDependencies = defaultDependencies,
): Promise<PostDisplay[]> {
    const previewSafePosts = await sanitizeInternalPreviews(posts, viewerDid, dependencies);
    return sanitizeSharedOriginals(previewSafePosts, viewerDid, dependencies, 0, MAX_SHARED_POST_DEPTH);
}

export function parseInternalPreviewUrl(url: string): { type: InternalPreviewType; id: string } | null {
    try {
        const pathname = new URL(url, "http://internal.invalid").pathname;
        const circle = pathname.match(/^\/circles\/([^/]+)\/?$/);
        if (circle) return { type: "circle", id: decodeURIComponent(circle[1]) };
        const match = pathname.match(
            /^\/circles\/[^/]+\/(post|tasks|shifts|events|goals|issues|proposals|funding)\/([^/]+)\/?$/,
        );
        if (!match) return null;
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
        return { type: typeBySegment[match[1] as keyof typeof typeBySegment], id: decodeURIComponent(match[2]) };
    } catch {
        return null;
    }
}

export async function resolveInternalPreviewUrl(
    url: string,
    viewerDid: string,
    dependencies: NestedContentDependencies = defaultDependencies,
): Promise<ResolvedInternalPreview | null> {
    const parsed = parseInternalPreviewUrl(url);
    if (!parsed) return null;
    const probe = {
        content: url,
        internalPreviewType: parsed.type,
        internalPreviewId: parsed.id,
        internalPreviewUrl: url,
    } as PostDisplay;
    const [resolved] = await sanitizePostNestedContent([probe], viewerDid, dependencies);
    if (!resolved.internalPreviewType || !resolved.internalPreviewId || !resolved.internalPreviewUrl || !resolved.internalPreviewData) {
        return null;
    }
    return {
        type: resolved.internalPreviewType,
        id: resolved.internalPreviewId,
        url: resolved.internalPreviewUrl,
        data: resolved.internalPreviewData as InternalPreviewData,
    };
}

export async function resolveInternalPreviewAction(
    url: string,
    dependencies: InternalPreviewActionDependencies,
): Promise<InternalPreviewActionResult> {
    try {
        const viewerDid = await dependencies.getViewerDid();
        if (!viewerDid) return { error: "Preview unavailable" };
        const preview = await (dependencies.resolvePreview ?? resolveInternalPreviewUrl)(url, viewerDid);
        return preview ?? { error: "Preview unavailable" };
    } catch {
        console.error("Internal link preview lookup failed");
        return { error: "Preview unavailable" };
    }
}
