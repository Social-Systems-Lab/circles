// circle.ts - circle creation and management

import { Circle, CircleType, PlatformMetrics, ServerSettings, SortingOptions, WithMetric } from "@/models/models";
import { getServerSettings } from "./server-settings";
import { Circles } from "./db";
import { ObjectId } from "mongodb";
import { getDefaultAccessRules, defaultUserGroups, defaultPages, features } from "./constants";
import { getMetrics } from "../utils/metrics";
import { upsertVbdCircles } from "./vdb";
import { createDefaultChatRooms, getChatRoomByHandle, updateChatRoom } from "./chat";

export const SAFE_CIRCLE_PROJECTION = {
    _id: 1,
    did: 1,
    publicKey: 1,
    name: 1,
    type: 1,
    email: 1,
    handle: 1,
    picture: 1,
    cover: 1,
    description: 1,
    content: 1,
    mission: 1,
    isPublic: 1,
    userGroups: 1,
    pages: 1,
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
    completedOnboardingSteps: 1,
    metadata: 1, // Include metadata for shadow post IDs
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

    circles = await Circles.find({}, { projection: SAFE_CIRCLE_PROJECTION }).toArray();

    circles.forEach((circle: Circle) => {
        if (circle._id) {
            circle._id = circle._id.toString();
        }
    });
    //circles = filterLocations(circles) as any[];
    return circles;
};

export const getCircles = async (parentCircleId?: string, circleType?: CircleType): Promise<Circle[]> => {
    let circles: Circle[] = [];
    if (!parentCircleId) {
        circles = await Circles.find(
            { circleType: circleType ?? "circle" },
            { projection: SAFE_CIRCLE_PROJECTION },
        ).toArray();
    } else {
        circles = await Circles.find(
            { parentCircleId: parentCircleId, circleType: circleType ?? { $in: ["circle", "project"] } },
            { projection: SAFE_CIRCLE_PROJECTION },
        ).toArray();
    }
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
): Promise<WithMetric<Circle>[]> => {
    let circles = (await getCircles(parentCircleId, circleType)) as WithMetric<Circle>[];
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

export const getMetricsForCircles = async (circles: WithMetric<Circle>[], userDid: string, sort?: SortingOptions) => {
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
        name: "Circles",
        description: "Connect. Collaborate. Create Change.",
        handle: "default",
        picture: { url: "/images/default-picture.png" },
        cover: { url: "/images/default-cover.png" },
        userGroups: defaultUserGroups,
        accessRules: getDefaultAccessRules(),
        pages: defaultPages,
        questionnaire: [],
        isPublic: true,
        circleType: "circle",
    };
    return circle;
};

export const createCircle = async (circle: Circle): Promise<Circle> => {
    if (!circle?.name || !circle?.handle) {
        throw new Error("Missing required fields");
    }

    // check if handle is already in use
    let existingCircle = await Circles.findOne({ handle: circle.handle }, { projection: SAFE_CIRCLE_PROJECTION });
    if (existingCircle) {
        throw new Error("Handle already in use");
    }

    circle.createdAt = new Date();
    circle.userGroups = defaultUserGroups;
    circle.accessRules = getDefaultAccessRules();
    circle.pages = defaultPages;
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

    // create circle chat room
    try {
        await createDefaultChatRooms(circle._id);
    } catch (e) {
        console.error("Failed to create chat rooms", e);
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
    console.log("🔍 [DB] getCircleById query:", JSON.stringify(query));

    let circle = (await Circles.findOne(query, { projection: SAFE_CIRCLE_PROJECTION })) as Circle;

    console.log("🔍 [DB] getCircleById result:", {
        found: circle ? "Yes" : "No",
        id: circle?._id?.toString(),
        type: circle?.circleType,
        name: circle?.name,
    });

    if (circle?._id) {
        circle._id = circle._id.toString();
    }
    return circle;
};

export const updateCircle = async (circle: Partial<Circle>): Promise<void> => {
    let { _id, ...circleWithoutId } = circle;
    let result = await Circles.updateOne({ _id: new ObjectId(_id) }, { $set: circleWithoutId });
    if (result.matchedCount === 0) {
        throw new Error("Circle not found");
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
    let query = {
        "metadata.commentPostId": postId,
        circleType: "project" as CircleType,
    };

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
