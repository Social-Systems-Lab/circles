// circle.ts - circle creation and management

import { Circle, CircleType, PlatformMetrics, Post, ServerSettings, SortingOptions, WithMetric } from "@/models/models";
import { getServerSettings } from "./server-settings";
import { Circles, Members, MembershipRequests, Feeds, Posts, ChatRooms } from "./db";
import { ObjectId } from "mongodb";
import { getDefaultAccessRules, defaultUserGroups, getDefaultModules } from "./constants";
import { getMetrics } from "../utils/metrics";
import { deleteVbdCircle, deleteVbdPost, upsertVbdCircles } from "./vdb";
import { createDefaultChatRooms, getChatRoomByHandle, updateChatRoom } from "./chat";
import { createDefaultFeed } from "./feed";
import path from "path";
import fs from "fs";
import { USERS_DIR } from "../auth/auth";

export const SAFE_CIRCLE_PROJECTION = {
    _id: 1,
    did: 1,
    publicKey: 1,
    name: 1,
    type: 1,
    email: 1,
    handle: 1,
    picture: 1,
    images: 1,
    description: 1,
    content: 1,
    mission: 1,
    isPublic: 1,
    isMember: 1,
    userGroups: 1,
    enabledModules: 1,
    accessRules: 1,
    members: 1,
    questionnaire: 1,
    parentCircleId: 1,
    createdBy: 1,
    createdAt: 1,
    circleType: 1,
    interests: 1,
    offers_needs: 1,
    location: 1,
    causes: 1,
    skills: 1,
    offers: 1,
    engagements: 1,
    needs: 1,
    completedOnboardingSteps: 1,
    metadata: 1, // Include metadata for shadow post IDs
    socialLinks: 1,
    websiteUrl: 1,
} as const;

export const getCirclesByIds = async (ids: string[]): Promise<Circle[]> => {
    let objectIds = ids.map((id) => new ObjectId(id));
    let circles = await Circles.find({ _id: { $in: objectIds } }, { projection: SAFE_CIRCLE_PROJECTION }).toArray();
    circles.forEach((circle: Circle) => {
        if (circle._id) {
            circle._id = circle._id.toString();
        }
    });
    return circles;
};

export const getCirclesByDids = async (dids: string[]): Promise<Circle[]> => {
    let circles = await Circles.find({ did: { $in: dids } }, { projection: SAFE_CIRCLE_PROJECTION }).toArray();
    circles.forEach((circle: Circle) => {
        if (circle._id) {
            circle._id = circle._id.toString();
        }
    });
    return circles;
};

export const getDefaultCircle = async (inServerConfig: ServerSettings | null = null): Promise<Circle> => {
    if (process.env.IS_BUILD === "true") {
        return createDefaultCircle();
    }

    let serverConfig = inServerConfig ?? (await getServerSettings());
    let circle = (await Circles.findOne(
        { _id: new ObjectId(serverConfig?.defaultCircleId) },
        { projection: SAFE_CIRCLE_PROJECTION },
    )) as Circle;

    if (!circle) {
        return createDefaultCircle();
    }

    if (circle._id) {
        circle._id = circle._id.toString();
    }

    return circle;
};

export const getSwipeCircles = async (): Promise<Circle[]> => {
    let circles: Circle[] = [];

    circles = await Circles.find(
        {
            $or: [
                { circleType: { $ne: "user" } },
                { $and: [{ circleType: "user" }, { $or: [{ isVerified: true }, { isMember: true }] }] },
            ],
        },
        { projection: SAFE_CIRCLE_PROJECTION },
    ).toArray();

    circles.forEach((circle: Circle) => {
        if (circle._id) {
            circle._id = circle._id.toString();
        }
    });
    //circles = filterLocations(circles) as any[];
    return circles;
};

export const getCircles = async (
    parentCircleId?: string,
    circleType?: CircleType,
    sdgHandles?: string[],
): Promise<Circle[]> => {
    let query: any = { circleType: circleType ?? "circle" };
    if (parentCircleId) {
        query.parentCircleId = parentCircleId;
    }
    if (sdgHandles && sdgHandles.length > 0) {
        query.causes = { $in: sdgHandles };
    }

    let circles = await Circles.find(query, { projection: SAFE_CIRCLE_PROJECTION }).toArray();
    circles.forEach((circle: Circle) => {
        if (circle._id) {
            circle._id = circle._id.toString();
        }
    });
    //circles = filterLocations(circles) as any[];
    return circles;
};

export const countCirclesAndUsers = async (): Promise<PlatformMetrics> => {
    const circles = await Circles.countDocuments({ circleType: "circle" });
    const users = await Circles.countDocuments({ circleType: "user" });

    return { circles, users };
};

export const getCirclesWithMetrics = async (
    userDid?: string,
    parentCircleId?: string,
    sort?: SortingOptions,
    circleType?: CircleType,
    sdgHandles?: string[],
): Promise<WithMetric<Circle>[]> => {
    let circles = (await getCircles(parentCircleId, circleType, sdgHandles)) as WithMetric<Circle>[];

    console.log("🔍 [DB] getCirclesWithMetrics query:", { userDid, parentCircleId, sort, circleType });
    const currentDate = new Date();
    let user = undefined;
    if (userDid) {
        user = (await Circles.findOne({ did: userDid }, { projection: SAFE_CIRCLE_PROJECTION })) ?? undefined;
    }

    // get metrics for each circle
    for (const circle of circles) {
        circle.metrics = await getMetrics(user, circle, currentDate, sort);
    }

    // sort circles by rank
    circles.sort((a, b) => (a.metrics?.rank ?? 0) - (b.metrics?.rank ?? 0));

    console.log("🔍 [DB] getCirclesWithMetrics result:", {
        count: circles.length,
        userDid,
        parentCircleId,
        sort,
        circleType,
    });
    return circles;
};

export const getMetricsForCircles = async (
    circles: WithMetric<Circle>[],
    userDid: string | undefined,
    sort?: SortingOptions,
) => {
    const currentDate = new Date();
    let user = undefined;
    if (userDid) {
        user = (await Circles.findOne({ did: userDid }, { projection: SAFE_CIRCLE_PROJECTION })) ?? undefined;
    }

    // get metrics for each circle
    for (const circle of circles) {
        circle.metrics = await getMetrics(user, circle, currentDate, sort);
    }

    // sort circles by rank
    circles.sort((a, b) => (a.metrics?.rank ?? 0) - (b.metrics?.rank ?? 0));
    return circles;
};

export const createDefaultCircle = (): Circle => {
    let circle: Circle = {
        name: "Kamooni",
        description: "Connect. Collaborate. Create Change.",
        handle: "default",
        picture: { url: "/images/default-picture.png" },
        userGroups: defaultUserGroups,
        enabledModules: getDefaultModules("circle"),
        accessRules: getDefaultAccessRules(),
        questionnaire: [],
        isPublic: true,
        circleType: "circle",
    };
    return circle;
};

export const createCircle = async (circle: Circle, authenticatedUserDid: string): Promise<Circle> => {
    if (!circle?.name || !circle?.handle) {
        throw new Error("Missing required fields");
    }
    if (!authenticatedUserDid) {
        // Ensure we have the creator's DID
        throw new Error("Authenticated user DID is required to create a circle.");
    }

    // check if handle is already in use
    let existingCircle = await Circles.findOne({ handle: circle.handle }, { projection: SAFE_CIRCLE_PROJECTION });
    if (existingCircle) {
        throw new Error("Handle already in use");
    }

    circle.createdAt = new Date();
    circle.userGroups = defaultUserGroups;

    // Set default enabled modules based on circle type
    let defaultModules = getDefaultModules(circle.circleType ?? "circle");

    // Set the enabledModules
    circle.enabledModules = circle.enabledModules || defaultModules;

    // Set the access rules
    circle.accessRules = getDefaultAccessRules();
    circle.questionnaire = [];
    circle.circleType = circle.circleType || "circle";

    let result = await Circles.insertOne(circle);
    circle._id = result.insertedId.toString();

    // update circle embedding
    try {
        await upsertVbdCircles([circle]);
    } catch (e) {
        console.error("Failed to upsert circle embedding", e);
    }

    // create circle chat room, passing the creator's DID
    try {
        await createDefaultChatRooms(circle._id, authenticatedUserDid);
    } catch (e) {
        console.error("Failed to create chat rooms", e);
    }

    // create default feed
    try {
        await createDefaultFeed(circle._id);
    } catch (e) {
        console.error("Failed to create default feed", e);
    }

    return circle;
};

export const getCircleByHandle = async (handle: string): Promise<Circle> => {
    let circle = (await Circles.findOne({ handle: handle }, { projection: SAFE_CIRCLE_PROJECTION })) as Circle;
    if (circle?._id) {
        circle._id = circle._id.toString();
    }
    return circle;
};

export const getCircleById = async (id: string | null, criteria?: any): Promise<Circle> => {
    let query = id ? { _id: new ObjectId(id) } : criteria;
    let circle = (await Circles.findOne(query, { projection: SAFE_CIRCLE_PROJECTION })) as Circle;

    if (circle?._id) {
        circle._id = circle._id.toString();
    }
    return circle;
};

export const getCircleByDid = async (did: string): Promise<Circle> => {
    let circle = (await Circles.findOne({ did: did }, { projection: SAFE_CIRCLE_PROJECTION })) as Circle;
    if (circle?._id) {
        circle._id = circle._id.toString();
    }
    return circle;
};

export const updateCircle = async (circle: Partial<Circle>, authenticatedUserDid: string): Promise<void> => {
    const { _id, ...circleWithoutId } = circle;
    if (!_id) {
        throw new Error("Circle ID is required for update");
    }

    // Fetch the existing circle to check ownership for user circles
    const existingCircle = await getCircleById(_id);
    if (!existingCircle) {
        throw new Error("Circle not found");
    }

    // Authorization check: If it's a user circle, ensure the authenticated user owns it
    if (existingCircle.circleType === "user") {
        if (!authenticatedUserDid || existingCircle.did !== authenticatedUserDid) {
            console.error(
                `Unauthorized attempt to update user circle. Circle DID: ${existingCircle.did}, Authenticated DID: ${authenticatedUserDid}`,
            );
            throw new Error("Unauthorized: Cannot update another user's circle profile.");
        }
    }
    // Note: For non-user circles, authorization is assumed to be handled by the calling action using isAuthorized()

    // Prevent critical fields from being overwritten
    delete circleWithoutId.did; // DID should never change
    delete circleWithoutId.email; // Email should likely be updated via a separate, dedicated process if needed
    delete circleWithoutId.circleType; // CircleType should not change after creation

    // Check for handle conflict if handle is being updated
    if (circleWithoutId.handle && circleWithoutId.handle !== existingCircle.handle) {
        const conflictingCircle = await Circles.findOne({
            handle: circleWithoutId.handle,
            _id: { $ne: new ObjectId(_id) }, // Exclude the current circle
        });
        if (conflictingCircle) {
            throw new Error(`Handle "${circleWithoutId.handle}" is already in use.`);
        }
    }

    // Proceed with the update
    let result = await Circles.updateOne({ _id: new ObjectId(_id) }, { $set: circleWithoutId });
    if (result.matchedCount === 0) {
        // This should theoretically not happen due to the getCircleById check above, but keep for safety
        throw new Error("Circle not found during update operation");
    }

    // update circle embedding
    let c = await getCircleById(_id);
    try {
        await upsertVbdCircles([c]);
    } catch (e) {
        console.error("Failed to upsert circle embedding", e);
    }

    // update circle chat room
    const membersChat = await getChatRoomByHandle(_id.toString(), "members");
    if (membersChat) {
        await updateChatRoom({
            _id: membersChat._id,
            name: circle.name, // keep chat name in sync
            picture: circle.picture, // keep chat avatar in sync
        });
    }
};

export const getCirclePath = async (circle: Partial<Circle>): Promise<string> => {
    let serverConfig = await getServerSettings();
    if (circle._id === serverConfig.defaultCircleId) {
        return "/";
    }
    return `/circles/${circle.handle}/`;
};

export const getCirclesBySearchQuery = async (query: string, limit: number = 10) => {
    const regex = new RegExp(query, "i"); // case-insensitive search
    const circles = await Circles.find({ name: regex }, { projection: SAFE_CIRCLE_PROJECTION }).limit(limit).toArray();
    circles.forEach((circle: Circle) => {
        if (circle._id) {
            circle._id = circle._id.toString();
        }
    });
    return circles as Circle[];
};

/**
 * Find a project by its shadow post ID (used for project comment notifications)
 */
export const findProjectByShadowPostId = async (postId: string): Promise<Circle | null> => {
    console.log("🔍 [DB] findProjectByShadowPostId query:", { postId });

    // Direct query for the project
    let query = { "metadata.commentPostId": postId, circleType: "project" as CircleType };

    let project = (await Circles.findOne(query, { projection: SAFE_CIRCLE_PROJECTION })) as Circle;

    if (project?._id) {
        project._id = project._id.toString();
        console.log("🔍 [DB] Found project for shadow post:", {
            postId,
            projectId: project._id,
            projectName: project.name,
        });
    } else {
        console.log("🔍 [DB] No project found for shadow post:", { postId });
    }

    return project || null;
};

/**
 * Delete a circle and all associated data
 * @param circleId The ID of the circle to delete
 */
export const deleteCircle = async (circleId: string): Promise<void> => {
    console.log("🗑️ [DB] Deleting circle:", circleId);

    // Get the circle to be deleted
    const circle = await getCircleById(circleId);
    if (!circle) {
        throw new Error("Circle not found");
    }

    // Delete the circle from the database
    const result = await Circles.deleteOne({ _id: new ObjectId(circleId) });

    if (result.deletedCount === 0) {
        throw new Error("Failed to delete circle");
    }

    // Delete all members of the circle
    await Members.deleteMany({ circleId: circleId });

    // Delete all membership requests for the circle
    await MembershipRequests.deleteMany({ circleId: circleId });

    // Delete all feeds associated with the circle
    const feeds = await Feeds.find({ circleId: circleId }).toArray();
    const feedIds = feeds.map((feed) => feed._id.toString());

    await Feeds.deleteMany({ circleId: circleId });

    // Get all posts in the feeds to delete them from vector database later
    interface PostWithId {
        _id: ObjectId | string;
    }

    let allPosts: PostWithId[] = [];
    for (const feedId of feedIds) {
        const posts = await Posts.find({ feedId: feedId }).toArray();
        allPosts = [...allPosts, ...posts.map((post) => ({ _id: post._id }))];
        // Delete posts from MongoDB
        await Posts.deleteMany({ feedId: feedId });
    }

    // Delete all chat rooms associated with the circle
    await ChatRooms.deleteMany({ circleId: circleId });

    // Delete circle from vector database
    try {
        await deleteVbdCircle(circleId);
        console.log("🗑️ [VDB] Circle deleted from vector database:", circleId);
    } catch (error) {
        console.error("Error deleting circle from vector database:", error);
    }

    // Delete all posts from vector database
    for (const post of allPosts) {
        try {
            await deleteVbdPost(post._id.toString());
        } catch (error) {
            console.error("Error deleting post from vector database:", error);
        }
    }

    // If the circle is a user, delete the user files
    if (circle.circleType === "user" && circle.did) {
        try {
            const userDir = path.join(USERS_DIR, circle.did);
            if (fs.existsSync(userDir)) {
                fs.rmSync(userDir, { recursive: true, force: true });
                console.log("🗑️ [FS] User directory deleted:", userDir);
            }
        } catch (error) {
            console.error("Error deleting user files:", error);
        }
    }

    console.log("🗑️ [DB] Circle deleted successfully:", circleId);
};

/**
 * Ensures a specific module is enabled on a user's own circle.
 * @param circleId The ID of the user's circle.
 * @param moduleHandle The handle of the module to enable.
 * @param currentUserDid The DID of the currently authenticated user.
 * @returns True if the module was enabled or already enabled, false otherwise.
 */
export const ensureModuleIsEnabledOnCircle = async (
    circleId: string,
    moduleHandle: string,
    currentUserDid: string,
): Promise<boolean> => {
    try {
        const circle = await getCircleById(circleId);

        if (!circle) {
            console.warn(`[ensureModuleIsEnabledOnCircle] Circle not found: ${circleId}`);
            return false;
        }

        // This function is intended only for user circles (user profiles)
        if (circle.circleType !== "user") {
            console.log(
                `[ensureModuleIsEnabledOnCircle] Skipping module enablement for non-user circle: ${circleId}, type: ${circle.circleType}`,
            );
            return true; // Not an error, but no action taken for non-user circles
        }

        // Verify the currentUserDid matches the circle's owner DID
        if (circle.did !== currentUserDid) {
            console.error(
                `[ensureModuleIsEnabledOnCircle] Unauthorized attempt to enable module. User DID ${currentUserDid} does not own circle ${circleId} (owner DID: ${circle.did})`,
            );
            return false;
        }

        const currentEnabledModules = circle.enabledModules || [];
        if (currentEnabledModules.includes(moduleHandle)) {
            console.log(
                `[ensureModuleIsEnabledOnCircle] Module ${moduleHandle} already enabled for circle ${circleId}`,
            );
            return true;
        }

        const newEnabledModules = [...currentEnabledModules, moduleHandle];
        await updateCircle({ _id: circleId, enabledModules: newEnabledModules }, currentUserDid);
        console.log(`[ensureModuleIsEnabledOnCircle] Module ${moduleHandle} enabled for circle ${circleId}`);
        return true;
    } catch (error) {
        console.error(
            `[ensureModuleIsEnabledOnCircle] Error enabling module ${moduleHandle} for circle ${circleId}:`,
            error,
        );
        return false;
    }
};
