import weaviate, { dataType, generateUuid5, WeaviateClient } from "weaviate-client";
import { Cause, Skill, Circle, Post, MemberDisplay, PostDisplay } from "../../models/models";
import { ObjectId } from "mongodb";
import { Causes, Circles, Posts, Skills } from "./db";
import { getFullLocationName } from "../utils";

let client: WeaviateClient | undefined = undefined;

export const getWeaviateClient = async () => {
    if (!client) {
        client = await weaviate.connectToLocal({
            port: 8080,
            host: "host.docker.internal",
            skipInitChecks: true,
            headers: {
                "X-OpenAI-Api-Key": process.env.OPENAI_API_KEY || "",
            },
            timeout: { init: 30, query: 60, insert: 120 },
        });
    }
    return client;
};

export const upsertWeaviateCollections = async () => {
    const client = await getWeaviateClient();

    // create collections if they don't exist
    if (!(await client.collections.exists("Circle"))) {
        await client.collections.create({
            name: "Circle",
            properties: [
                {
                    name: "name",
                    dataType: dataType.TEXT,
                },
                {
                    name: "description",
                    dataType: dataType.TEXT,
                },
                {
                    name: "handle",
                    dataType: dataType.TEXT,
                },
                {
                    name: "mission",
                    dataType: dataType.TEXT,
                },
                {
                    name: "circleType",
                    dataType: dataType.TEXT,
                },
                {
                    name: "createdAt",
                    dataType: dataType.DATE,
                },
                {
                    name: "isPublic",
                    dataType: dataType.BOOLEAN,
                },
                {
                    name: "locationName",
                    dataType: dataType.TEXT,
                },
                {
                    name: "location",
                    dataType: dataType.GEO_COORDINATES,
                },
            ],
            references: [
                {
                    name: "causes",
                    targetCollection: "Cause",
                },
                {
                    name: "skills",
                    targetCollection: "Skill",
                },
            ],
        });
    }

    if (!(await client.collections.exists("Post"))) {
        await client.collections.create({
            name: "Post",
            properties: [
                {
                    name: "content",
                    dataType: dataType.TEXT,
                },
                {
                    name: "createdAt",
                    dataType: dataType.DATE,
                },
                {
                    name: "createdBy",
                    dataType: dataType.TEXT,
                },
                {
                    name: "locationName",
                    dataType: dataType.TEXT,
                },
                {
                    name: "location",
                    dataType: dataType.GEO_COORDINATES,
                },
            ],
        });
    }

    if (!(await client.collections.exists("Cause"))) {
        await client.collections.create({
            name: "Cause",
            properties: [
                {
                    name: "name",
                    dataType: dataType.TEXT,
                },
                {
                    name: "description",
                    dataType: dataType.TEXT,
                },
                {
                    name: "handle",
                    dataType: dataType.TEXT,
                },
            ],
        });
    }

    if (!(await client.collections.exists("Skill"))) {
        await client.collections.create({
            name: "Skill",
            properties: [
                {
                    name: "name",
                    dataType: dataType.TEXT,
                },
                {
                    name: "description",
                    dataType: dataType.TEXT,
                },
                {
                    name: "handle",
                    dataType: dataType.TEXT,
                },
            ],
        });
    }

    // Batch insert Causes
    const causes = await Causes.find().toArray();
    const causeDataObjects = causes.map((cause: Cause) => ({
        properties: {
            name: cause.name,
            description: cause.description || "",
            handle: cause.handle,
        },
        id: generateUuid5("Cause", cause.handle), // Deterministic UUID based on handle
    }));

    const causeCollection = client.collections.get("Cause");
    await causeCollection.data.insertMany(causeDataObjects);
    console.log("All Causes upserted into Weaviate.");

    // Batch insert Skills
    const skills = await Skills.find().toArray();
    const skillDataObjects = skills.map((skill: Skill) => ({
        properties: {
            name: skill.name,
            description: skill.description || "",
            handle: skill.handle,
        },
        id: generateUuid5("Skill", skill.handle), // Deterministic UUID based on handle
    }));

    const skillCollection = client.collections.get("Skill");
    await skillCollection.data.insertMany(skillDataObjects);
    console.log("All Skills upserted into Weaviate.");

    // Batch insert Circles
    const circles = await Circles.find().toArray();
    const circleDataObjects = circles.map((circle: Circle) => {
        let dataObject: any = {
            properties: {
                name: circle.name || "",
                description: circle.description || "",
                handle: circle.handle || "",
                mission: circle.mission || "",
                circleType: circle.circleType || "circle",
                createdAt: circle.createdAt ? circle.createdAt.toISOString() : new Date().toISOString(),
                isPublic: circle.isPublic || true,
            },
            id: generateUuid5("Circle", circle.handle), // Deterministic UUID based on handle
            references: {
                causes: circle.causes?.map((causeHandle: string) => generateUuid5("Cause", causeHandle)) ?? [],
                skills: circle.skills?.map((skillHandle: string) => generateUuid5("Skill", skillHandle)) ?? [],
            },
        };
        if (circle.location) {
            dataObject.properties.locationName = getFullLocationName(circle.location);
            if (circle.location.lngLat) {
                dataObject.properties.location = {
                    latitude: circle.location.lngLat.lat,
                    longitude: circle.location.lngLat.lng,
                };
            }
        }
        return dataObject;
    });

    const circleCollection = client.collections.get("Circle");
    await circleCollection.data.insertMany(circleDataObjects);
    console.log("All Circles upserted into Weaviate.");

    // TODO see if we can vectorize post + images
    // Batch insert Posts
    const posts = await Posts.find().toArray();
    const postDataObjects = posts.map((post: Post) => {
        let dataObject: any = {
            properties: {
                content: post.content,
                createdAt: post.createdAt.toISOString(),
                createdBy: post.createdBy,
            },
            id: generateUuid5("Post", post._id), // Deterministic UUID based on MongoDB ID
        };

        if (post.location) {
            dataObject.properties.locationName = getFullLocationName(post.location);
            if (post.location.lngLat) {
                dataObject.properties.location = {
                    latitude: post.location.lngLat.lat,
                    longitude: post.location.lngLat.lng,
                };
            }
        }

        return dataObject;
    });

    const postCollection = client.collections.get("Post");
    await postCollection.data.insertMany(postDataObjects);
    console.log("All Posts upserted into Weaviate.");
};

export const upsertCauseWeaviate = async (cause: Cause): Promise<void> => {
    const client = await getWeaviateClient();
    const causeCollection = client.collections.get("Cause");

    const properties = {
        name: cause.name,
        description: cause.description || "",
        handle: cause.handle,
    };

    const id = generateUuid5("Cause", cause.handle);

    try {
        // Use insert to create or update the Cause in Weaviate
        await causeCollection.data.insert({
            properties,
            id,
        });
        console.log(`Cause ${cause.name} upserted in Weaviate with ID ${id}.`);
    } catch (error: any) {
        if (error.message.includes("already exists")) {
            // Object exists, perform an update
            await causeCollection.data.update({
                id,
                properties,
            });
            console.log(`Cause ${cause.name} updated in Weaviate.`);
        } else {
            console.error(`Failed to upsert Cause ${cause.name} in Weaviate:`, error);
        }
    }
};

export const deleteCauseWeaviate = async (causeHandle: string): Promise<void> => {
    const client = await getWeaviateClient();
    const causeCollection = client.collections.get("Cause");
    const id = generateUuid5("Cause", causeHandle);

    try {
        await causeCollection.data.deleteById(id);
        console.log(`Cause with ID ${id} deleted from Weaviate.`);
    } catch (error) {
        console.error(`Failed to delete Cause with ID ${id} from Weaviate:`, error);
    }
};

export const upsertSkillWeaviate = async (skill: Skill): Promise<void> => {
    const client = await getWeaviateClient();
    const skillCollection = client.collections.get("Skill");

    const properties = {
        name: skill.name,
        description: skill.description || "",
        handle: skill.handle,
    };

    const id = generateUuid5("Skill", skill.handle);

    try {
        await skillCollection.data.insert({
            properties,
            id,
        });
        console.log(`Skill ${skill.name} upserted in Weaviate with ID ${id}.`);
    } catch (error: any) {
        if (error.message.includes("already exists")) {
            // Object exists, perform an update
            await skillCollection.data.update({
                id,
                properties,
            });
            console.log(`Skill ${skill.name} updated in Weaviate.`);
        } else {
            console.error(`Failed to upsert Skill ${skill.name} in Weaviate:`, error);
        }
    }
};

export const deleteSkillWeaviate = async (skillHandle: string): Promise<void> => {
    const client = await getWeaviateClient();
    const skillCollection = client.collections.get("Skill");
    const id = generateUuid5("Skill", skillHandle);

    try {
        await skillCollection.data.deleteById(id);
        console.log(`Skill with ID ${id} deleted from Weaviate.`);
    } catch (error) {
        console.error(`Failed to delete Skill with ID ${id} from Weaviate:`, error);
    }
};

export const upsertCircleWeaviate = async (circle: Circle): Promise<void> => {
    const client = await getWeaviateClient();
    const circleCollection = client.collections.get("Circle");

    // Prepare properties
    const properties: any = {
        name: circle.name,
        description: circle.description || "",
        handle: circle.handle,
        mission: circle.mission || "",
        circleType: circle.circleType || "circle",
        createdAt: circle.createdAt ? circle.createdAt.toISOString() : new Date().toISOString(),
        isPublic: circle.isPublic || true,
    };

    if (circle.location) {
        properties.locationName = getFullLocationName(circle.location);
        if (circle.location.lngLat) {
            properties.location = {
                latitude: circle.location.lngLat.lat,
                longitude: circle.location.lngLat.lng,
            };
        }
    }

    const id = generateUuid5("Circle", circle.handle ?? "");

    // Prepare references
    const references: Record<string, string[]> = {};
    if (circle.causes && circle.causes.length > 0) {
        references["causes"] = circle.causes.map((causeHandle) => generateUuid5("Cause", causeHandle));
    }
    if (circle.skills && circle.skills.length > 0) {
        references["skills"] = circle.skills.map((skillHandle) => generateUuid5("Skill", skillHandle));
    }

    try {
        // Insert or update the Circle in Weaviate
        await circleCollection.data.insert({
            properties,
            id,
            references, // Include cross-references
        });
        console.log(`Circle ${circle.name} upserted in Weaviate with ID ${id}.`);
    } catch (error: any) {
        if (error.message.includes("already exists")) {
            // Object exists, perform an update
            await circleCollection.data.update({
                id,
                properties,
            });
            console.log(`Circle ${circle.name} updated in Weaviate.`);

            // Update cross-references
            await updateCircleReferences(circle);
        } else {
            console.error(`Failed to upsert Circle ${circle.name} in Weaviate:`, error);
        }
    }
};

// Helper function to update cross-references for a Circle
const updateCircleReferences = async (circle: Circle): Promise<void> => {
    const client = await getWeaviateClient();
    const circleCollection = client.collections.get("Circle");
    const id = generateUuid5("Circle", circle.handle ?? "");

    // Remove existing references
    await removeCircleReferences(id);

    // Add updated references
    // Prepare references
    if (circle.causes && circle.causes.length > 0) {
        for (const causeHandle of circle.causes) {
            const causeId = generateUuid5("Cause", causeHandle);
            await circleCollection.data.referenceAdd({
                fromUuid: id,
                fromProperty: "causes",
                to: causeId,
            });
        }
    }

    if (circle.skills && circle.skills.length > 0) {
        for (const skillHandle of circle.skills) {
            const skillId = generateUuid5("Skill", skillHandle);
            await circleCollection.data.referenceAdd({
                fromUuid: id,
                fromProperty: "skills",
                to: skillId,
            });
        }
    }

    console.log(`Cross-references updated for Circle ${circle.name}.`);
};

// Helper function to remove existing references for a Circle
const removeCircleReferences = async (circleId: string): Promise<void> => {
    const client = await getWeaviateClient();
    const circleCollection = client.collections.get("Circle");

    try {
        // Fetch the Circle object by ID, including references to causes and skills
        const circleObject = await circleCollection.query.fetchObjectById(circleId, {
            returnReferences: [{ linkOn: "causes" }, { linkOn: "skills" }],
        });

        // Check if the circle object and references exist
        if (circleObject && circleObject.references) {
            const { causes, skills } = circleObject.references;

            // Delete each cause reference if causes exist
            if (causes && causes.objects && causes.objects.length > 0) {
                for (const causeRef of causes.objects) {
                    await circleCollection.data.referenceDelete({
                        fromUuid: circleId,
                        fromProperty: "causes",
                        to: causeRef.uuid, // UUID of the referenced cause
                    });
                }
            }

            // Delete each skill reference if skills exist
            if (skills && skills.objects && skills.objects.length > 0) {
                for (const skillRef of skills.objects) {
                    await circleCollection.data.referenceDelete({
                        fromUuid: circleId,
                        fromProperty: "skills",
                        to: skillRef.uuid, // UUID of the referenced skill
                    });
                }
            }
        }

        console.log(`All references removed for Circle with ID ${circleId}.`);
    } catch (error) {
        console.error(`Failed to delete references for Circle with ID ${circleId}:`, error);
    }
};

export const deleteCircleWeaviate = async (circleHandle: string): Promise<void> => {
    const client = await getWeaviateClient();
    const circleCollection = client.collections.get("Circle");
    const id = generateUuid5("Circle", circleHandle);

    try {
        await circleCollection.data.deleteById(id);
        console.log(`Circle with ID ${id} deleted from Weaviate.`);
    } catch (error) {
        console.error(`Failed to delete Circle with ID ${id} from Weaviate:`, error);
    }
};

export const upsertPostWeaviate = async (post: Post): Promise<void> => {
    const client = await getWeaviateClient();
    const postCollection = client.collections.get("Post");

    const properties: any = {
        itemId: post._id,
        content: post.content,
        createdAt: post.createdAt.toISOString(),
        createdBy: post.createdBy,
    };

    if (post.location) {
        properties.locationName = getFullLocationName(post.location);
        if (post.location.lngLat) {
            properties.location = {
                latitude: post.location.lngLat.lat,
                longitude: post.location.lngLat.lng,
            };
        }
    }

    const id = generateUuid5("Post", post._id);

    try {
        await postCollection.data.insert({
            properties,
            id,
        });
    } catch (error: any) {
        if (error.message.includes("already exists")) {
            // Object exists, perform an update
            await postCollection.data.update({
                id,
                properties,
            });
        } else {
            console.error(`Failed to upsert Post ${post._id} in Weaviate:`, error);
        }
    }
};

export const deletePostWeaviate = async (postId: string): Promise<void> => {
    const client = await getWeaviateClient();
    const postCollection = client.collections.get("Post");
    const id = generateUuid5("Post", postId);

    try {
        await postCollection.data.deleteById(id);
    } catch (error) {
        console.error(`Failed to delete Post with ID ${id} from Weaviate:`, error);
    }
};

export const getDistanceForItemWeaviate = async (
    source: Circle,
    item: PostDisplay | Circle | MemberDisplay,
): Promise<number | undefined> => {
    if (!source) return undefined;

    let isCircle = item?.circleType === "circle" || item?.circleType === "user";
    const collectionName = isCircle ? "Circle" : "Post";
    const idName = isCircle ? "handle" : "itemId";
    const id = isCircle ? item.handle : item._id;

    if (!id) return undefined;

    try {
        const client = await getWeaviateClient();
        const collection = client.collections.get(collectionName);

        // get source circle vector
        let circleUuid = generateUuid5("Circle", source.handle);
        const circleObject = await client.collections.get("Circle").query.fetchObjectById(circleUuid, {
            includeVector: true,
        });
        const circleVector = circleObject?.vectors.default;

        if (!circleVector) {
            return undefined;
        }

        // match with target item
        const result = await collection.query.nearVector(circleVector, {
            filters: collection.filter.byProperty(idName).equal(id),
            limit: 1,
            returnMetadata: ["distance"],
        });

        // return distance metric
        const distance = result?.objects[0]?.metadata?.distance ?? undefined;
        return distance;
    } catch (error) {
        console.error(`Error fetching vibe distance for ${collectionName} ${id}:`, error);
        return undefined;
    }
};
