// circle creation and management

import { Circle, PlatformMetrics, ServerSettings, SortingOptions, WithMetric } from "@/models/models";
import { getServerSettings } from "./server-settings";
import { Circles } from "./db";
import { ObjectId } from "mongodb";
import { getDefaultAccessRules, defaultUserGroups, defaultPages, features } from "./constants";
import { upsertCircleWeaviate } from "./weaviate";
import { getMetrics } from "../utils/metrics";

export const getDefaultCircle = async (inServerConfig: ServerSettings | null = null): Promise<Circle> => {
    if (process.env.IS_BUILD === "true") {
        return createDefaultCircle();
    }

    let serverConfig = inServerConfig ?? (await getServerSettings());
    let circle = (await Circles.findOne({ _id: new ObjectId(serverConfig?.defaultCircleId) })) as Circle;

    if (!circle) {
        return createDefaultCircle();
    }

    if (circle._id) {
        circle._id = circle._id.toString();
    }

    return circle;
};

export const getCircles = async (parentCircleId?: string): Promise<Circle[]> => {
    let circles = await Circles.find({ parentCircleId: parentCircleId, circleType: "circle" }).toArray();
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
): Promise<WithMetric<Circle>[]> => {
    let circles = (await getCircles(parentCircleId)) as WithMetric<Circle>[];
    const currentDate = new Date();
    let user = undefined;
    if (userDid) {
        user = (await Circles.findOne({ did: userDid })) ?? undefined;
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
        description: "Your Social Platform",
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
    let existingCircle = await Circles.findOne({ handle: circle.handle });
    if (existingCircle) {
        throw new Error("Handle already in use");
    }

    circle.createdAt = new Date();
    circle.userGroups = defaultUserGroups;
    circle.accessRules = getDefaultAccessRules();
    circle.pages = defaultPages;
    circle.questionnaire = [];
    circle.circleType = "circle";

    let result = await Circles.insertOne(circle);
    circle._id = result.insertedId.toString();

    // update weaviate circle
    await upsertCircleWeaviate(circle);

    return circle;
};

export const getCircleByHandle = async (handle: string): Promise<Circle> => {
    let circle = (await Circles.findOne({ handle: handle })) as Circle;
    if (circle?._id) {
        circle._id = circle._id.toString();
    }
    return circle;
};

export const getCircleById = async (id: string): Promise<Circle> => {
    let circle = (await Circles.findOne({ _id: new ObjectId(id) })) as Circle;
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

    // update weaviate circle
    let c = await getCircleById(_id);
    await upsertCircleWeaviate(c);
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
    const circles = await Circles.find({ name: regex }).limit(limit).toArray();
    circles.forEach((circle: Circle) => {
        if (circle._id) {
            circle._id = circle._id.toString();
        }
    });
    return circles as Circle[];
};
