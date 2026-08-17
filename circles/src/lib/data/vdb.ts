import { QdrantClient } from "@qdrant/js-client-rest";
import {
    Cause as SDG,
    Skill,
    Circle,
    Post,
    MemberDisplay,
    PostDisplay,
    Event,
    Proposal,
    Task,
    Issue,
    Goal,
} from "../../models/models";
import { Circles, Posts, Skills, Events, Proposals, Tasks, Issues, Goals } from "./db";
import { getFullLocationName } from "../utils";
import OpenAI from "openai";
import { sdgs } from "@/lib/data/sdgs";
import { skills } from "@/lib/data/skills";
import { v5 as uuidv5 } from "uuid";
import { ObjectId } from "mongodb";
import {
    deletePublicCircleVectors,
    getCircleVectorPointId,
    normalizeCircleVectorMongoIds,
    reconcilePublicCircleVectorBatch,
    upsertEligiblePublicCircleVectors,
} from "@/lib/data/circle-vector-publication";
import {
    deleteDerivedResourceVectors,
    deleteRawVectorPoints,
    getDerivedVectorPointId,
    normalizeDerivedVectorMongoIds,
    publishEligibleDerivedResourceVectors,
    reconcileDerivedResourceVectorBatch,
    type DerivedVectorKind,
    type RawVectorPointId,
    type VectorResource,
} from "@/lib/data/derived-vector-publication";
import { loadEligibleCanonicalDerivedResources } from "@/lib/data/derived-vector-ownership";
import {
    reconcileSecretOwnedDerivedPublicVectors,
    type DerivedVectorPointPage,
} from "@/lib/data/derived-vector-reconciliation";

let qdrantClient: QdrantClient | undefined = undefined;
let openAiClient: OpenAI | undefined = undefined;
let hasLoggedVdbDisabled = false;

const isVdbEnabled = () => {
    const flag = process.env.VDB_ENABLED;
    if (flag === undefined || flag === null) {
        return true;
    }

    const normalized = flag.trim().toLowerCase();
    if (!normalized) {
        return true;
    }

    return normalized !== "false" && normalized !== "0" && normalized !== "off";
};

class VdbDisabledError extends Error {
    constructor() {
        super("Vector database features are disabled via VDB_ENABLED env variable.");
        this.name = "VdbDisabledError";
    }
}

const logVdbDisabled = (context: string) => {
    if (!hasLoggedVdbDisabled) {
        console.info(
            `[VDB] Disabled locally – skipping ${context}. Set VDB_ENABLED=true to enable Qdrant/OpenAI features.`,
        );
        hasLoggedVdbDisabled = true;
    }
};

export const getQdrantClient = async () => {
    if (!isVdbEnabled()) {
        throw new VdbDisabledError();
    }

    if (!qdrantClient) {
        qdrantClient = new QdrantClient({
            host: process.env.QDRANT_HOST ?? "qdrant",
            port: 6333,
            // url: `http://${process.env.QDRANT_HOST ?? "qdrant"}:6333`,
            timeout: 30000,
        });
    }
    return qdrantClient;
};

export const getOpenAiClient = () => {
    if (!openAiClient) {
        openAiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openAiClient;
};

export type VbdCategories =
    | "circles"
    | "sdgs"
    | "skills"
    | "posts"
    | "events"
    | "proposals"
    | "tasks"
    | "issues"
    | "goals";

const vdbCollections: VbdCategories[] = [
    "circles",
    "sdgs",
    "skills",
    "posts",
    "events",
    "proposals",
    "tasks",
    "issues",
    "goals",
];

const getEmbeddings = async (textArray: string[]) => {
    try {
        let openai = getOpenAiClient();

        // Create embeddings for the array of texts
        const response = await openai.embeddings.create({
            input: textArray,
            model: "text-embedding-3-small",
        });

        return response.data.map((item: any) => item.embedding); // Extract embeddings from the response
    } catch (error) {
        console.error("Error generating embeddings:", error);
        return [];
    }
};

export const upsertVdbCollections = async () => {
    const client = await getQdrantClient();

    const response = await client.getCollections();

    console.log("Existing collections in Qdrant:", response.collections);
    const existingCollections = response.collections.map((collection: any) => collection.name);
    const missingCollections = vdbCollections.filter((collection) => !existingCollections.includes(collection));

    for (const collection of missingCollections) {
        await client.createCollection(collection, {
            vectors: {
                size: 1536,
                distance: "Cosine",
            },
        });
        console.log(`Collection ${collection} created in Qdrant.`);
    }

    // upsert data for each collection
    console.log("Reconciling public circles in Qdrant...");
    const circles = await Circles.find().toArray();
    const circleResult = await reconcilePublicCircleVectorBatch(circles, {
        deleteCircles: deleteVbdCircles,
        upsertCircles: upsertVbdCircles,
    });
    console.log(
        `${circleResult.eligibleCount} public circles upserted; ${circleResult.purgedCount} secret vectors purged.`,
    );

    console.log("Reconciling secret-owned and orphaned derived vectors in Qdrant...");
    await reconcileSecretOwnedDerivedPublicVectors();

    const reconcileDerivedCollection = async <TResource extends VectorResource>(
        kind: DerivedVectorKind,
        resources: TResource[],
        upsertResources: (resources: TResource[]) => Promise<unknown>,
    ) => {
        const result = await reconcileDerivedResourceVectorBatch(resources, {
            loadEligibleCanonicalResources: (ids, fullDocument) =>
                loadEligibleCanonicalDerivedResources<TResource>(kind, ids, fullDocument),
            deleteResources: async (ids) => {
                await deleteVbdDerivedResources(kind, ids);
            },
            assertResourcesAbsent: (ids) => assertVbdDerivedResourcesAbsent(kind, ids),
            upsertResources,
        });
        console.log(
            `${result.eligibleCount} public ${kind} upserted; ${result.purgedCount} secret-owned vectors purged.`,
        );
    };

    console.log("Reconciling public posts in Qdrant...");
    await reconcileDerivedCollection(
        "posts",
        (await Posts.find().toArray()) as unknown as PostDisplay[],
        upsertVbdPosts,
    );

    console.log("Upserting sdgs to Qdrant...");
    await upsertVbdSdgs();
    console.log(`${sdgs.length} sdgs upserted.`);

    console.log("Upserting skills to Qdrant...");
    await upsertVbdSkills();
    console.log(`${skills.length} skills upserted.`);

    // New entity upserts
    console.log("Reconciling public events in Qdrant...");
    await reconcileDerivedCollection("events", await Events.find().toArray(), upsertVbdEvents);

    console.log("Reconciling public proposals in Qdrant...");
    await reconcileDerivedCollection("proposals", await Proposals.find().toArray(), upsertVbdProposals);

    console.log("Reconciling public tasks in Qdrant...");
    await reconcileDerivedCollection("tasks", await Tasks.find().toArray(), upsertVbdTasks);

    console.log("Reconciling public issues in Qdrant...");
    await reconcileDerivedCollection("issues", await Issues.find().toArray(), upsertVbdIssues);

    console.log("Reconciling public goals in Qdrant...");
    await reconcileDerivedCollection("goals", await Goals.find().toArray(), upsertVbdGoals);
};

// Helper function to format a circle into readable text
export const formatCircleForEmbedding = (circle: Circle) => {
    const sdgNames = getNamesFromHandles(circle.causes || [], sdgs);
    const skillNames = getNamesFromHandles(circle.skills || [], skills);

    return `
      Name: ${circle.name}
      Type: ${circle.circleType}
      Description: ${circle.description ?? "N/A"}
      Mission: ${circle.mission ?? "N/A"}
      Location: ${circle.location ? getFullLocationName(circle.location) : "N/A"}
      SDGs: ${sdgNames.length <= 0 ? "N/A" : sdgNames.join(", ")}
      Skills: ${skillNames.length <= 0 ? "N/A" : skillNames.join(", ")}
      Content: ${circle.content ?? "N/A"}
      Offers: ${circle.offers?.text ?? "N/A"}
      Offer Skills: ${circle.offers?.skills?.join(", ") ?? "N/A"}
      Engagements: ${circle.engagements?.text ?? "N/A"}
      Engagement Interests: ${circle.engagements?.interests?.join(", ") ?? "N/A"}
      Needs: ${circle.needs?.text ?? "N/A"}
      Need Tags: ${circle.needs?.tags?.join(", ") ?? "N/A"}
    `;
};

// Helper function to format a post for embedding
export const formatPostForEmbedding = (post: PostDisplay) => {
    return `
      Content: ${post.content}
      Author: ${post.author?.name ? post.author?.name : "N/A"}
      Created At: ${post.createdAt.toISOString()}
      Location: ${post.location ? getFullLocationName(post.location) : "N/A"}
    `;
};

// Helper function to format a skill for embedding
export const formatSkillForEmbedding = (skill: Skill) => {
    return `
      Name: ${skill.name}
      Description: ${skill.description}
    `;
};

// Helper function to format a sdg for embedding
export const formatSdgForEmbedding = (sdg: SDG) => {
    return `
      Name: ${sdg.name}
      Description: ${sdg.description ?? ""}
    `;
};

// New helper formatters
export const formatEventForEmbedding = (e: Event) => {
    return `
      Title: ${e.title}
      Description: ${e.description ?? ""}
      Stage: ${e.stage}
      When: ${e.allDay ? "All day" : ""} ${e.startAt?.toString?.() ?? ""} - ${e.endAt?.toString?.() ?? ""}
      Format: ${e.isVirtual ? "Virtual" : e.isHybrid ? "Hybrid" : "In-person"}
      Virtual URL: ${e.virtualUrl ?? ""}
      Location: ${e.location ? getFullLocationName(e.location) : "N/A"}
      Categories: ${e.categories?.join(", ") ?? ""}
      SDGs: ${e.causes?.join(", ") ?? ""}
    `;
};

export const formatProposalForEmbedding = (p: Proposal) => {
    return `
      Name: ${p.name}
      Background: ${p.background}
      Decision: ${p.decisionText}
      Stage: ${p.stage}
      Outcome: ${p.outcome ?? ""}
      Voting Deadline: ${p.votingDeadline?.toString?.() ?? ""}
      Location: ${p.location ? getFullLocationName(p.location) : "N/A"}
    `;
};

export const formatTaskForEmbedding = (t: Task) => {
    return `
      Title: ${t.title}
      Description: ${t.description}
      Stage: ${t.stage}
      Assigned To: ${t.assignedTo ?? "Unassigned"}
      Goal Id: ${t.goalId ?? ""}
      Location: ${t.location ? getFullLocationName(t.location) : "N/A"}
    `;
};

export const formatIssueForEmbedding = (i: Issue) => {
    return `
      Title: ${i.title}
      Description: ${i.description}
      Stage: ${i.stage}
      Assigned To: ${i.assignedTo ?? "Unassigned"}
      Location: ${i.location ? getFullLocationName(i.location) : "N/A"}
    `;
};

export const formatGoalForEmbedding = (g: Goal) => {
    return `
      Title: ${g.title}
      Description: ${g.description}
      Stage: ${g.stage}
      Target Date: ${g.targetDate?.toString?.() ?? ""}
      Result: ${g.resultSummary ?? ""}
      Location: ${g.location ? getFullLocationName(g.location) : "N/A"}
    `;
};

// Utility function to map handles to names for sdgs or skills
const getNamesFromHandles = (handles: string[], data: any[]) => {
    return handles.map((handle) => {
        const item = data.find((d) => d.handle === handle);
        return item ? item.name : handle; // Fallback to handle if name not found
    });
};

const sdgNs = "2fb0c076-39d6-5c9b-b98d-24409f4ebfbc";
const skillNs = "e8b887ec-5e3d-5383-9565-7fc72bb0e251";

type DerivedPoint = { id: string; vector: number[]; payload: Record<string, unknown> };

const upsertDerivedResources = async <TResource extends VectorResource>(
    kind: DerivedVectorKind,
    resources: TResource[],
    formatResource: (resource: TResource) => string,
    buildPayload: (resource: TResource) => Record<string, unknown>,
) => {
    let preparedClient: QdrantClient | undefined;
    return publishEligibleDerivedResourceVectors<TResource, number[], DerivedPoint>(resources, {
        loadEligibleCanonicalResources: (ids, fullDocument) =>
            loadEligibleCanonicalDerivedResources<TResource>(kind, ids, fullDocument),
        preparePublication: async () => {
            preparedClient = await getQdrantClient();
        },
        formatResource,
        embedTexts: getEmbeddings,
        buildPoint: (resource, embedding) => ({
            id: getDerivedVectorPointId(kind, resource._id!.toString()),
            vector: embedding,
            payload: buildPayload(resource),
        }),
        upsertPoints: async (points) => {
            if (!preparedClient) throw new Error("Public derived-resource vector client was not prepared.");
            await preparedClient.upsert(kind, { points });
        },
        deleteResources: (ids) => deleteVbdDerivedResources(kind, ids).then(() => undefined),
        assertResourcesAbsent: (ids) => assertVbdDerivedResourcesAbsent(kind, ids),
    });
};

// Upsert function for circles
export const upsertVbdCircles = async (circles: Circle[]) => {
    let preparedClient: QdrantClient | undefined;
    return upsertEligiblePublicCircleVectors<
        number[],
        { id: string; vector: number[]; payload: Record<string, unknown> }
    >(circles, {
        loadCanonicalCircles: async (circleIds, fullDocument) => {
            const objectIds = circleIds.map((circleId) => new ObjectId(circleId));
            if (fullDocument) return Circles.find({ _id: { $in: objectIds } }).toArray();
            return Circles.find(
                { _id: { $in: objectIds } },
                { projection: { _id: 1, circleType: 1, visibility: 1 } },
            ).toArray();
        },
        preparePublication: async () => {
            preparedClient = await getQdrantClient();
        },
        formatCircle: formatCircleForEmbedding,
        embedTexts: getEmbeddings,
        buildPoint: (circle, embedding) => ({
            id: getCircleVectorPointId(circle._id!.toString()),
            vector: embedding,
            payload: {
                mongoId: circle._id!.toString(), // Add MongoDB _id here
                name: circle.name,
                description: circle.description,
                content: circle.content ?? "",
                mission: circle.mission,
                circleType: circle.circleType,
                createdAt: circle.createdAt?.toISOString(),
                isPublic: circle.isPublic,
                locationName: circle.location ? getFullLocationName(circle.location) : null,
                location: circle.location?.lngLat
                    ? {
                          latitude: circle.location.lngLat.lat,
                          longitude: circle.location.lngLat.lng,
                      }
                    : null,
                causes: circle.causes,
                skills: circle.skills,
            },
        }),
        upsertPoints: async (points) => {
            if (!preparedClient) throw new Error("Public Circle vector client was not prepared.");
            console.log("Upserting public Circle embeddings. Count:", points.length);
            await preparedClient.upsert("circles", { points });
        },
        deleteCircles: async (circleIds) => {
            await deleteVbdCircles(circleIds);
        },
        assertCirclesAbsent: assertVbdCirclesAbsent,
    });
};

// Repeat similar logic for posts, sdgs, and skills
export const upsertVbdPosts = async (posts: PostDisplay[]) => {
    return upsertDerivedResources("posts", posts, formatPostForEmbedding, (post) => ({
        mongoId: post._id!.toString(), // Add MongoDB _id here
        content: post.content,
        createdAt: post.createdAt.toISOString(),
        createdBy: post.createdBy,
        locationName: post.location ? getFullLocationName(post.location) : null,
    }));
};

// Upsert function for sdgs
export const upsertVbdSdgs = async () => {
    const client = await getQdrantClient();

    // Ensure all sdgs have valid `handle` fields
    const validSdgs = sdgs.filter((sdg) => sdg.handle);
    if (validSdgs.length <= 0) {
        console.log("No valid sdgs to upsert.");
        return;
    }

    console.log("Getting embeddings for sdgs...");

    const embeddings = await getEmbeddings(validSdgs.map((sdg) => formatSdgForEmbedding(sdg)));

    const qdrantPoints = validSdgs.map((sdg, i) => ({
        id: uuidv5(sdg.handle as string, sdgNs), // Ensure handle is always a string
        vector: embeddings[i], // Ensure embedding is a valid number[]
        payload: {
            name: sdg.name,
            description: sdg.description,
        },
    }));

    console.log("Upserting embeddings...");

    // Upsert into the 'sdgs' collection in Qdrant
    await client.upsert("sdgs", { points: qdrantPoints });
};

// Upsert function for skills
export const upsertVbdSkills = async () => {
    const client = await getQdrantClient();

    // Ensure all skills have valid `handle` fields
    const validSkills = skills.filter((skill) => skill.handle);
    if (validSkills.length <= 0) {
        console.log("No valid skills to upsert.");
        return;
    }

    console.log("Getting embeddings for skills...");

    const embeddings = await getEmbeddings(validSkills.map((skill) => formatSkillForEmbedding(skill)));

    const qdrantPoints = validSkills.map((skill, i) => ({
        id: uuidv5(skill.handle, skillNs), // Ensure handle is always a string
        vector: embeddings[i], // Ensure embedding is a valid number[]
        payload: {
            name: skill.name,
            description: skill.description,
        },
    }));

    console.log("Upserting embeddings...");

    // Upsert into the 'skills' collection in Qdrant
    await client.upsert("skills", { points: qdrantPoints });
};

// New: Upsert function for events
export const upsertVbdEvents = async (events: Event[]) => {
    return upsertDerivedResources("events", events, formatEventForEmbedding, (e) => ({
        mongoId: e._id!.toString(),
        title: e.title,
        description: e.description,
        stage: e.stage,
        createdAt: (e as any).createdAt?.toString?.(),
        circleId: e.circleId,
        locationName: e.location ? getFullLocationName(e.location) : null,
        isVirtual: !!e.isVirtual,
        isHybrid: !!e.isHybrid,
        virtualUrl: e.virtualUrl ?? null,
        startAt: e.startAt?.toString?.(),
        endAt: e.endAt?.toString?.(),
        allDay: !!e.allDay,
        categories: e.categories ?? [],
        causes: e.causes ?? [],
    }));
};

// New: Upsert function for proposals
export const upsertVbdProposals = async (proposals: Proposal[]) => {
    return upsertDerivedResources("proposals", proposals, formatProposalForEmbedding, (p) => ({
        mongoId: p._id!.toString(),
        name: p.name,
        background: p.background,
        decisionText: p.decisionText,
        stage: p.stage,
        outcome: p.outcome ?? null,
        createdAt: (p as any).createdAt?.toString?.(),
        circleId: p.circleId,
        locationName: p.location ? getFullLocationName(p.location) : null,
    }));
};

// New: Upsert function for tasks
export const upsertVbdTasks = async (tasks: Task[]) => {
    return upsertDerivedResources("tasks", tasks, formatTaskForEmbedding, (t) => ({
        mongoId: t._id!.toString(),
        title: t.title,
        description: t.description,
        stage: t.stage,
        assignedTo: t.assignedTo ?? null,
        createdAt: (t as any).createdAt?.toString?.(),
        circleId: t.circleId,
        goalId: t.goalId ?? null,
        locationName: t.location ? getFullLocationName(t.location) : null,
    }));
};

// New: Upsert function for issues
export const upsertVbdIssues = async (issues: Issue[]) => {
    return upsertDerivedResources("issues", issues, formatIssueForEmbedding, (x) => ({
        mongoId: x._id!.toString(),
        title: x.title,
        description: x.description,
        stage: x.stage,
        assignedTo: x.assignedTo ?? null,
        createdAt: (x as any).createdAt?.toString?.(),
        circleId: x.circleId,
        locationName: x.location ? getFullLocationName(x.location) : null,
    }));
};

// New: Upsert function for goals
export const upsertVbdGoals = async (goals: Goal[]) => {
    return upsertDerivedResources("goals", goals, formatGoalForEmbedding, (g) => ({
        mongoId: g._id!.toString(),
        title: g.title,
        description: g.description,
        stage: g.stage,
        createdAt: (g as any).createdAt?.toString?.(),
        circleId: g.circleId,
        targetDate: g.targetDate?.toString?.() ?? null,
        locationName: g.location ? getFullLocationName(g.location) : null,
    }));
};

export const reconcileVbdDerivedResource = async (kind: DerivedVectorKind, resourceId: string) => {
    const placeholder = { _id: new ObjectId(resourceId) };
    let result;
    switch (kind) {
        case "posts":
            return upsertVbdPosts([placeholder as PostDisplay]);
        case "tasks":
            result = await upsertVbdTasks([placeholder as Task]);
            break;
        case "events":
            result = await upsertVbdEvents([placeholder as Event]);
            break;
        case "goals":
            result = await upsertVbdGoals([placeholder as Goal]);
            break;
        case "issues":
            result = await upsertVbdIssues([placeholder as Issue]);
            break;
        case "proposals":
            result = await upsertVbdProposals([placeholder as Proposal]);
            break;
    }
    const parentItemTypeByKind = {
        tasks: "task",
        events: "event",
        goals: "goal",
        issues: "issue",
        proposals: "proposal",
    } as const;
    const parentItemType = parentItemTypeByKind[kind as keyof typeof parentItemTypeByKind];
    const shadowPosts = await Posts.find(
        { parentItemType, parentItemId: resourceId },
        { projection: { _id: 1 } },
    ).toArray();
    if (shadowPosts.length > 0) {
        await upsertVbdPosts(shadowPosts as unknown as PostDisplay[]);
    }
    return result;
};

export const deleteVbdCircles = async (circleIds: readonly unknown[]) => {
    return deletePublicCircleVectors(circleIds, {
        deletePoints: async (pointIds, options) => {
            const client = await getQdrantClient();
            await client.delete("circles", {
                points: pointIds,
                wait: options.wait,
            });
        },
    });
};

// Method to delete circles from Qdrant by ID
export const deleteVbdCircle = async (circleId: string) => {
    await deleteVbdCircles([circleId]);
};

export const assertVbdCirclesAbsent = async (circleIds: readonly unknown[]): Promise<void> => {
    const normalizedIds = normalizeCircleVectorMongoIds(circleIds);
    if (normalizedIds.length === 0) return;
    const client = await getQdrantClient();
    const existing = await client.retrieve("circles", {
        ids: normalizedIds.map(getCircleVectorPointId),
        with_payload: false,
        with_vector: false,
    });
    if (existing.length > 0) throw new Error("Public Circle vector deletion could not be verified.");
};

export const deleteVbdDerivedResources = async (kind: DerivedVectorKind, resourceIds: readonly unknown[]) =>
    deleteDerivedResourceVectors(kind, resourceIds, {
        deletePoints: async (pointIds, options) => {
            const client = await getQdrantClient();
            await client.delete(kind, { points: pointIds, wait: options.wait });
        },
    });

export const assertVbdDerivedResourcesAbsent = async (
    kind: DerivedVectorKind,
    resourceIds: readonly unknown[],
): Promise<void> => {
    const normalizedIds = normalizeDerivedVectorMongoIds(resourceIds);
    if (normalizedIds.length === 0) return;
    const client = await getQdrantClient();
    const existing = await client.retrieve(kind, {
        ids: normalizedIds.map((resourceId) => getDerivedVectorPointId(kind, resourceId)),
        with_payload: false,
        with_vector: false,
    });
    if (existing.length > 0) throw new Error(`Public ${kind} vector deletion could not be verified.`);
};

export const deleteVbdDerivedResourcePoints = async (
    kind: DerivedVectorKind,
    pointIds: RawVectorPointId[],
): Promise<void> => {
    await deleteRawVectorPoints(pointIds, {
        deletePoints: async (uniquePointIds, options) => {
            const client = await getQdrantClient();
            await client.delete(kind, { points: uniquePointIds, wait: options.wait });
        },
    });
};

export const assertVbdDerivedResourcePointsAbsent = async (
    kind: DerivedVectorKind,
    pointIds: RawVectorPointId[],
): Promise<void> => {
    const uniquePointIds = Array.from(new Set(pointIds));
    if (uniquePointIds.length === 0) return;
    const client = await getQdrantClient();
    const existing = await client.retrieve(kind, {
        ids: uniquePointIds,
        with_payload: false,
        with_vector: false,
    });
    if (existing.length > 0) throw new Error(`Public ${kind} raw-point deletion could not be verified.`);
};

export const scrollVbdDerivedResourcePoints = async (
    kind: DerivedVectorKind,
    offset?: string | number,
): Promise<DerivedVectorPointPage> => {
    const client = await getQdrantClient();
    const page = await client.scroll(kind, {
        limit: 250,
        offset,
        with_payload: ["mongoId"],
        with_vector: false,
    });
    return {
        points: page.points.map((point) => ({ pointId: point.id, mongoId: point.payload?.mongoId })),
        nextOffset:
            typeof page.next_page_offset === "string" || typeof page.next_page_offset === "number"
                ? page.next_page_offset
                : null,
    };
};

// Method to delete posts from Qdrant by ID
export const deleteVbdPost = async (postId: string) => {
    await deleteVbdDerivedResources("posts", [postId]);
};

export const getVbdCircleById = async (circleId: string) => {
    const client = await getQdrantClient();

    let uuid = getCircleVectorPointId(circleId);

    // Retrieve the circle by ID
    const response = await client.retrieve("circles", {
        ids: [uuid],
        with_vector: true, // If you need the vector as well
        with_payload: false, // To get the payload (metadata) along with the vector
    });

    if (response.length > 0) {
        return response[0]; // Return the first match if available
    } else {
        console.error(`No circle found with ID: ${circleId}`);
        return null;
    }
};

export const getVbdPostById = async (postId: string) => {
    const client = await getQdrantClient();

    let uuid = getDerivedVectorPointId("posts", postId);

    // Retrieve the post by its ID
    const response = await client.retrieve("posts", {
        ids: [uuid],
        with_vector: true, // Assuming you don't need the vector
        with_payload: false, // Get the payload (metadata)
    });

    if (response.length > 0) {
        return response[0]; // Return the first match if available
    } else {
        console.error(`No post found with ID: ${postId}`);
        return null;
    }
};

export const getVbdSimilarity = async (
    source: Circle,
    item: PostDisplay | Circle | MemberDisplay,
): Promise<number | undefined> => {
    if (!source || !item) return undefined;

    // Determine whether the item is a Circle or a Post, and select the appropriate collection
    const isCircle =
        (item as any)?.circleType === "circle" ||
        (item as any)?.circleType === "user" ||
        (item as any)?.circleType === "project";
    const collectionName = isCircle ? "circles" : "posts";
    const idName = (item as any)._id?.toString();
    const sourceIdName = (source as any)._id?.toString();
    let sourceUuid = getCircleVectorPointId(sourceIdName);
    let targetUuid = isCircle ? getCircleVectorPointId(idName) : getDerivedVectorPointId("posts", idName);

    // Force recompile check
    if (!idName) return undefined;

    try {
        const client = await getQdrantClient();

        // Fetch the vectors for both the source circle and the target item
        const sourceResponse = await client.retrieve("circles", {
            ids: [sourceUuid],
            with_vector: true, // Fetch vector as well
        });

        const targetResponse = await client.retrieve(collectionName, {
            ids: [targetUuid],
            with_vector: true, // Fetch vector as well
        });

        const sourceVector = sourceResponse[0]?.vector as number[];
        const targetVector = targetResponse[0]?.vector as number[];

        if (!sourceVector || !targetVector) return undefined;

        // Calculate cosine similarity between the two vectors
        const similarity = calculateCosineSimilarity(sourceVector, targetVector);
        return similarity;
    } catch (error) {
        if (error instanceof VdbDisabledError) {
            logVdbDisabled("similarity scoring");
            return undefined;
        }
        console.warn(`Error fetching similarity for ${collectionName} ${idName}:`, error);
        return undefined;
    }
};

const calculateCosineSimilarity = (vecA: number[], vecB: number[]): number => {
    const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
};

// Define the structure for search results
export interface SearchResultItem {
    _id: string; // Original MongoDB ObjectId as string
    qdrantId: string; // Qdrant UUID
    type: "circle" | "project" | "user" | "post"; // Type of content
    score: number; // Similarity score from Qdrant
}

// Function for semantic search across specified collections
export const semanticSearchContent = async (options: {
    query: string;
    categories: string[]; // e.g., ['circles', 'posts']
    limit?: number;
    sdgHandles?: string[];
}): Promise<SearchResultItem[]> => {
    const { query, categories, limit = 20, sdgHandles } = options;

    if (!isVdbEnabled()) {
        logVdbDisabled("semantic search");
        return [];
    }

    if ((!query || query.trim() === "") && (!sdgHandles || sdgHandles.length === 0)) {
        return [];
    }

    const client = await getQdrantClient();
    const openai = getOpenAiClient();

    try {
        // 1. Get embedding for the search query
        let queryVector: number[] | undefined;
        if (query && query.trim() !== "") {
            const queryEmbeddingResponse = await openai.embeddings.create({
                input: [query],
                model: "text-embedding-3-small",
            });
            queryVector = queryEmbeddingResponse.data[0]?.embedding;

            if (!queryVector) {
                console.error("Failed to generate embedding for the query.");
                return [];
            }
        }

        // 2. Prepare search requests for each category (collection)
        const searchPromises = categories.map((collectionName) => {
            // Ensure collection name is valid
            if (!vdbCollections.includes(collectionName as VbdCategories)) {
                console.warn(`Invalid collection name provided: ${collectionName}`);
                return Promise.resolve([] as any[]); // Return empty results for invalid collections
            }

            const filter: any = {};
            if (sdgHandles && sdgHandles.length > 0) {
                filter.must = [
                    {
                        key: "causes",
                        match: {
                            any: sdgHandles,
                        },
                    },
                ];
            }

            if (queryVector) {
                return client.search(collectionName, {
                    vector: queryVector,
                    limit: limit,
                    with_payload: true, // We need the payload data
                    filter: filter,
                });
            } else {
                // When no query vector, use scroll with filtering
                return client
                    .scroll(collectionName, {
                        limit: limit,
                        with_payload: true,
                        filter: filter,
                    })
                    .then((response) => response.points);
            }
        });

        // 3. Execute searches in parallel
        const searchResults = await Promise.all(searchPromises);

        // 4. Combine and process results
        let combinedResults: SearchResultItem[] = [];
        searchResults.forEach((resultSet, index) => {
            const collectionName = categories[index]; // Get the corresponding collection name

            resultSet.forEach((hit: any) => {
                const payload = hit.payload;
                const type = collectionName === "posts" ? "post" : payload?.circleType || "circle"; // Determine type

                console.log("Search hit:", hit);

                // Map payload to SearchResultItem structure
                const resultItem: SearchResultItem = {
                    _id: payload?.mongoId, // Use the stored mongoId
                    qdrantId: hit.id,
                    type: type,
                    score: hit.score,
                };
                combinedResults.push(resultItem);
            });
        });

        // 5. Sort combined results by score (descending) and take top N
        combinedResults.sort((a, b) => b.score - a.score);
        combinedResults = combinedResults.slice(0, limit);

        return combinedResults;
    } catch (error) {
        console.error("Error during semantic search:", error);
        return [];
    }
};
