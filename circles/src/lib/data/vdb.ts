import { QdrantClient } from "@qdrant/js-client-rest";
import { Cause, Skill, Circle, Post, MemberDisplay, PostDisplay } from "../../models/models";
import { ObjectId } from "mongodb";
import { Causes, Circles, Posts, Skills } from "./db";
import { getFullLocationName } from "../utils";
import OpenAI from "openai";
import { causes, skills } from "./constants";
import { getPostsForEmbedding } from "./feed";
import { v5 as uuidv5 } from "uuid";

let qdrantClient: QdrantClient | undefined = undefined;
let openAiClient: OpenAI | undefined = undefined;

export const getQdrantClient = async () => {
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

const vdbCollections = ["circles", "causes", "skills", "posts"];

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
    console.log("Upserting circles to Qdrant...");
    const circles = await Circles.find().toArray();
    await upsertVbdCircles(circles);
    console.log(`${circles.length} circles upserted.`);

    console.log("Upserting posts to Qdrant...");
    const posts = await getPostsForEmbedding();
    await upsertVbdPosts(posts);
    console.log(`${posts.length} posts upserted.`);

    console.log("Upserting causes to Qdrant...");
    await upsertVbdCauses();
    console.log(`${causes.length} causes upserted.`);

    console.log("Upserting skills to Qdrant...");
    await upsertVbdSkills();
    console.log(`${skills.length} skills upserted.`);
};

// Helper function to format a circle into readable text
export const formatCircleForEmbedding = (circle: Circle) => {
    const causeNames = getNamesFromHandles(circle.causes || [], causes);
    const skillNames = getNamesFromHandles(circle.skills || [], skills);

    const skillsLabel = circle.circleType === "user" ? "offers" : "needs";

    return `
      Name: ${circle.name}
      Type: ${circle.circleType}
      Description: ${circle.description ?? "N/A"}
      Mission: ${circle.mission ?? "N/A"}
      Location: ${circle.location ? getFullLocationName(circle.location) : "N/A"}
      Causes: ${causeNames.length <= 0 ? "N/A" : causeNames.join(", ")}
      ${skillsLabel}: ${skillNames.length <= 0 ? "N/A" : skillNames.join(", ")}
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

// Helper function to format a cause for embedding
export const formatCauseForEmbedding = (cause: Cause) => {
    return `
      Name: ${cause.name}
      Description: ${cause.description ?? ""}
    `;
};

// Utility function to map handles to names for causes or skills
const getNamesFromHandles = (handles: string[], data: any[]) => {
    return handles.map((handle) => {
        const item = data.find((d) => d.handle === handle);
        return item ? item.name : handle; // Fallback to handle if name not found
    });
};

const circleNs = "374c3b2f-be54-5c82-b3a1-f16f7b205cdc";
const postNs = "425f7857-1b1b-5ddc-b797-bd12ff00023c";
const causeNs = "2fb0c076-39d6-5c9b-b98d-24409f4ebfbc";
const skillNs = "e8b887ec-5e3d-5383-9565-7fc72bb0e251";

// Upsert function for circles
export const upsertVbdCircles = async (circles: Circle[]) => {
    const client = await getQdrantClient();

    console.log("Getting embeddings for circles...");

    const embeddings = await getEmbeddings(circles.map((circle) => formatCircleForEmbedding(circle)));

    const qdrantPoints = circles.map((circle, i) => ({
        id: uuidv5(circle._id!, circleNs),
        vector: embeddings[i],
        payload: {
            name: circle.name,
            description: circle.description,
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
    }));

    console.log("Upserting embeddings...");
    // Ensure that embeddings are in the correct format (e.g., number[])
    await client.upsert("circles", { points: qdrantPoints });
};

// Repeat similar logic for posts, causes, and skills
export const upsertVbdPosts = async (posts: PostDisplay[]) => {
    const client = await getQdrantClient();

    // Ensure all posts have valid `_id` fields
    const validPosts = posts.filter((post) => post._id);

    console.log("Getting embeddings for posts...");

    const embeddings = await getEmbeddings(validPosts.map((post) => formatPostForEmbedding(post)));

    const qdrantPoints = validPosts.map((post, i) => ({
        id: uuidv5(post._id.toString(), postNs), // Ensure `_id` is stringified
        vector: embeddings[i], // Ensure embedding is a valid number[]
        payload: {
            content: post.content,
            createdAt: post.createdAt.toISOString(),
            createdBy: post.createdBy,
            locationName: post.location ? getFullLocationName(post.location) : null,
        },
    }));

    console.log("Upserting embeddings...");
    await client.upsert("posts", { points: qdrantPoints });
};

// Upsert function for causes
export const upsertVbdCauses = async () => {
    const client = await getQdrantClient();

    // Ensure all causes have valid `handle` fields
    const validCauses = causes.filter((cause) => cause.handle);

    console.log("Getting embeddings for causes...");

    const embeddings = await getEmbeddings(validCauses.map((cause) => formatCauseForEmbedding(cause)));

    const qdrantPoints = validCauses.map((cause, i) => ({
        id: uuidv5(cause.handle as string, causeNs), // Ensure handle is always a string
        vector: embeddings[i], // Ensure embedding is a valid number[]
        payload: {
            name: cause.name,
            description: cause.description,
        },
    }));

    console.log("Upserting embeddings...");

    // Upsert into the 'causes' collection in Qdrant
    await client.upsert("causes", { points: qdrantPoints });
};

// Upsert function for skills
export const upsertVbdSkills = async () => {
    const client = await getQdrantClient();

    // Ensure all skills have valid `handle` fields
    const validSkills = skills.filter((skill) => skill.handle);

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

// Method to delete circles from Qdrant by ID
export const deleteVbdCircle = async (circleId: string) => {
    const client = await getQdrantClient();

    let uuid = uuidv5(circleId, circleNs);

    // Delete the circle from the 'circles' collection in Qdrant
    await client.delete("circles", {
        points: [uuid],
    });

    console.log(`Circle with ID ${circleId} deleted from Qdrant.`);
};

// Method to delete posts from Qdrant by ID
export const deleteVbdPost = async (postId: string) => {
    const client = await getQdrantClient();

    let uuid = uuidv5(postId, postNs);

    // Delete the post from the 'posts' collection in Qdrant
    await client.delete("posts", {
        points: [uuid],
    });

    console.log(`Post with ID ${postId} deleted from Qdrant.`);
};

export const getVbdCircleById = async (circleId: string) => {
    const client = await getQdrantClient();

    let uuid = uuidv5(circleId, circleNs);

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

    let uuid = uuidv5(postId, postNs);

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

    const client = await getQdrantClient();

    // Determine whether the item is a Circle or a Post, and select the appropriate collection
    const isCircle = item?.circleType === "circle" || item?.circleType === "user";
    const collectionName = isCircle ? "circles" : "posts";
    const idName = item._id?.toString();
    const sourceIdName = source._id?.toString();
    const targetNs = isCircle ? circleNs : postNs;

    let sourceUuid = uuidv5(sourceIdName, circleNs);
    let targetUuid = uuidv5(idName, targetNs);

    if (!idName) return undefined;

    try {
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
        console.error(`Error fetching similarity for ${collectionName} ${idName}:`, error);
        return undefined;
    }
};

const calculateCosineSimilarity = (vecA: number[], vecB: number[]): number => {
    const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
};