// circle creation and management

import { Circle, ServerSettings } from "@/models/models";
import { getServerSettings } from "./server-settings";
import { Circles } from "./db";
import { ObjectId } from "mongodb";
import { getDefaultAccessRules, defaultUserGroups, defaultPages, features } from "./constants";

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
        isPublic: true,
    };
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

export const updateCircle = async (circle: Circle): Promise<void> => {
    let { _id, ...circleWithoutId } = circle;
    let result = await Circles.updateOne({ _id: new ObjectId(_id) }, { $set: circleWithoutId });
    if (result.matchedCount === 0) {
        throw new Error("Circle not found");
    }
};

export const getCirclePath = async (circle: Circle): Promise<string> => {
    let serverConfig = await getServerSettings();
    if (circle._id === serverConfig.defaultCircleId) {
        return "/";
    }
    return `/circles/${circle.handle}/`;
};
