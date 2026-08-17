import { ObjectId } from "mongodb";
import type { Circle, Event, Feed, Goal, Issue, Post, PostDisplay, Proposal, Task } from "@/models/models";
import { Circles, Events, Feeds, Goals, Issues, Posts, Proposals, Tasks } from "@/lib/data/db";
import { isCircleEligibleForPublicVectorIndex } from "@/lib/data/circle-visibility-policy";
import type { DerivedVectorKind, VectorResource } from "@/lib/data/derived-vector-publication";

type DerivedResource = Post | PostDisplay | Task | Event | Goal | Issue | Proposal;

const collectionByKind = {
    posts: Posts,
    tasks: Tasks,
    events: Events,
    goals: Goals,
    issues: Issues,
    proposals: Proposals,
};

const normalizeOwnerIds = (values: readonly unknown[]): string[] | null => {
    if (values.length === 0 || values.some((value) => typeof value !== "string" || !ObjectId.isValid(value)))
        return null;
    return Array.from(new Set(values.map((value) => new ObjectId(value as string).toHexString())));
};

export const getAuthoritativeOwnerCircleIds = (
    kind: DerivedVectorKind,
    resource: DerivedResource,
    feedsById: ReadonlyMap<string, Feed> = new Map(),
): string[] | null => {
    if (kind === "posts") {
        const feedId = (resource as Post).feedId;
        if (typeof feedId !== "string" || !ObjectId.isValid(feedId)) return null;
        const feed = feedsById.get(new ObjectId(feedId).toHexString());
        return feed ? normalizeOwnerIds([feed.circleId]) : null;
    }
    if (kind === "events") {
        const event = resource as Event;
        return normalizeOwnerIds([event.circleId, ...(event.hostCircleIds || [])]);
    }
    return normalizeOwnerIds([(resource as Task | Goal | Issue | Proposal).circleId]);
};

export const filterDerivedResourcesForPublicVectorIndex = <TResource extends DerivedResource>(
    kind: DerivedVectorKind,
    resources: TResource[],
    circles: Circle[],
    feeds: Feed[] = [],
    additionalOwnerIdsByResourceId: ReadonlyMap<string, string[] | null> = new Map(),
): TResource[] => {
    const circlesById = new Map(circles.map((circle) => [circle._id?.toString(), circle]));
    const feedsById = new Map(feeds.map((feed) => [feed._id?.toString(), feed]));

    return resources.filter((resource) => {
        const ownerIds = getAuthoritativeOwnerCircleIds(kind, resource, feedsById);
        const additionalOwnerIds = additionalOwnerIdsByResourceId.get(resource._id?.toString());
        const allOwnerIds =
            additionalOwnerIds === undefined
                ? ownerIds
                : ownerIds && additionalOwnerIds
                  ? [...ownerIds, ...additionalOwnerIds]
                  : null;
        return Boolean(
            allOwnerIds?.length &&
                allOwnerIds.every((circleId) => isCircleEligibleForPublicVectorIndex(circlesById.get(circleId))),
        );
    });
};

const sourceByParentType = {
    task: { collection: Tasks, kind: "tasks" },
    event: { collection: Events, kind: "events" },
    goal: { collection: Goals, kind: "goals" },
    issue: { collection: Issues, kind: "issues" },
    proposal: { collection: Proposals, kind: "proposals" },
} as const;

export type DerivedOwnershipResolverDependencies = {
    findFeeds: (feedIds: ObjectId[]) => Promise<Feed[]>;
    findSourceResources: (
        parentType: keyof typeof sourceByParentType,
        parentIds: ObjectId[],
    ) => Promise<DerivedResource[]>;
    findCircles: (circleIds: ObjectId[]) => Promise<Circle[]>;
};

const defaultOwnershipResolverDependencies: DerivedOwnershipResolverDependencies = {
    findFeeds: (feedIds) => Feeds.find({ _id: { $in: feedIds } }).toArray(),
    findSourceResources: async (parentType, parentIds) =>
        sourceByParentType[parentType].collection.find({ _id: { $in: parentIds } } as never).toArray() as Promise<
            DerivedResource[]
        >,
    findCircles: (circleIds) =>
        Circles.find({ _id: { $in: circleIds } }, { projection: { _id: 1, circleType: 1, visibility: 1 } }).toArray(),
};

const loadPostSourceOwners = async (posts: DerivedResource[], dependencies: DerivedOwnershipResolverDependencies) => {
    const ownersByPostId = new Map<string, string[] | null>();
    for (const parentType of Object.keys(sourceByParentType) as Array<keyof typeof sourceByParentType>) {
        const matchingPosts = posts.filter((post) => (post as Post).parentItemType === parentType);
        const parentIds = matchingPosts
            .map((post) => (post as Post).parentItemId)
            .filter((parentId): parentId is string => typeof parentId === "string" && ObjectId.isValid(parentId));
        const source = sourceByParentType[parentType];
        const parents = parentIds.length
            ? await dependencies.findSourceResources(
                  parentType,
                  parentIds.map((parentId) => new ObjectId(parentId)),
              )
            : [];
        const parentsById = new Map(parents.map((parent) => [parent._id.toString(), parent as DerivedResource]));
        for (const post of matchingPosts) {
            const parentId = (post as Post).parentItemId;
            const parent = typeof parentId === "string" ? parentsById.get(parentId) : undefined;
            ownersByPostId.set(
                post._id?.toString(),
                parent ? getAuthoritativeOwnerCircleIds(source.kind, parent) : null,
            );
        }
    }
    for (const post of posts) {
        const hasParentReference = Boolean((post as Post).parentItemId || (post as Post).parentItemType);
        if (hasParentReference && !ownersByPostId.has(post._id?.toString())) {
            ownersByPostId.set(post._id?.toString(), null);
        }
    }
    return ownersByPostId;
};

export const resolveEligibleDerivedResourcesWithCanonicalOwners = async <TResource extends DerivedResource>(
    kind: DerivedVectorKind,
    resources: TResource[],
    dependencies: DerivedOwnershipResolverDependencies = defaultOwnershipResolverDependencies,
): Promise<TResource[]> => {
    let feeds: Feed[] = [];
    if (kind === "posts") {
        const feedIds = Array.from(
            new Set(
                resources
                    .map((resource) => (resource as Post).feedId)
                    .filter((feedId): feedId is string => typeof feedId === "string" && ObjectId.isValid(feedId)),
            ),
        ).map((feedId) => new ObjectId(feedId));
        feeds = feedIds.length ? await dependencies.findFeeds(feedIds) : [];
    }

    const feedsById = new Map(feeds.map((feed) => [feed._id?.toString(), feed]));
    const additionalOwnerIdsByResourceId =
        kind === "posts" ? await loadPostSourceOwners(resources, dependencies) : new Map();
    const ownerIds = Array.from(
        new Set(
            resources.flatMap((resource) => [
                ...(getAuthoritativeOwnerCircleIds(kind, resource, feedsById) || []),
                ...(additionalOwnerIdsByResourceId.get(resource._id?.toString()) || []),
            ]),
        ),
    ).map((circleId) => new ObjectId(circleId));
    const circles = ownerIds.length ? await dependencies.findCircles(ownerIds) : [];
    return filterDerivedResourcesForPublicVectorIndex(kind, resources, circles, feeds, additionalOwnerIdsByResourceId);
};

export const getDerivedCanonicalResourceProjection = (kind: DerivedVectorKind, fullDocument: boolean) => {
    if (fullDocument) return undefined;
    if (kind === "posts") return { _id: 1, feedId: 1, parentItemId: 1, parentItemType: 1 } as const;
    if (kind === "events") return { _id: 1, circleId: 1, hostCircleIds: 1 } as const;
    return { _id: 1, circleId: 1 } as const;
};

const loadCanonicalResources = async (kind: DerivedVectorKind, ids: ObjectId[], fullDocument: boolean) => {
    const collection = collectionByKind[kind] as typeof Posts;
    const projection = getDerivedCanonicalResourceProjection(kind, fullDocument);
    return collection.find({ _id: { $in: ids } }, projection ? { projection } : undefined).toArray();
};

export const loadEligibleCanonicalDerivedResources = async <TResource extends VectorResource>(
    kind: DerivedVectorKind,
    resourceIds: string[],
    fullDocument: boolean,
): Promise<TResource[]> => {
    const validIds = resourceIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
    if (validIds.length === 0) return [];
    const resources = (await loadCanonicalResources(kind, validIds, fullDocument)) as unknown as DerivedResource[];

    const eligible = await resolveEligibleDerivedResourcesWithCanonicalOwners(kind, resources);

    if (kind === "posts" && fullDocument && eligible.length > 0) {
        const authorDids = Array.from(new Set(eligible.map((post) => (post as Post).createdBy).filter(Boolean)));
        const authors = authorDids.length ? await Circles.find({ did: { $in: authorDids } }).toArray() : [];
        const authorsByDid = new Map(authors.map((author) => [author.did, author]));
        return eligible.map((resource) => ({
            ...resource,
            author: authorsByDid.get((resource as Post).createdBy),
            circleType: "post" as const,
        })) as unknown as TResource[];
    }

    return eligible as unknown as TResource[];
};
