// circle creation and management

import { Circle, ServerConfig, defaultPages } from "@/models/models";
import { getServerConfig } from "./server-config";
import { Circles } from "./db";
import { ObjectId } from "mongodb";

export const getDefaultCircle = async (
    redirectIfSetup: boolean = false,
    inServerConfig: ServerConfig | null = null,
): Promise<Circle> => {
    let serverConfig = inServerConfig ?? (await getServerConfig(redirectIfSetup));
    let circle = await Circles.findOne({ _id: new ObjectId(serverConfig?.defaultCircleId) });

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
        userGroups: [
            {
                name: "Admins",
                handle: "admins",
                title: "Admin",
                description: "Administrators of the circle",
                readOnly: true,
            },
            {
                name: "Moderators",
                handle: "moderators",
                title: "Moderator",
                description: "Moderators of the circle",
                readOnly: true,
            },
            {
                name: "Members",
                handle: "members",
                title: "Member",
                description: "Members of the circle",
                readOnly: true,
            },
        ],
        pages: defaultPages,
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

export const updateCircle = async (circle: Circle): Promise<Circle> => {
    let { _id, ...circleWithoutId } = circle;
    let result = await Circles.updateOne({ _id: new ObjectId(_id) }, { $set: circleWithoutId });
    if (result.matchedCount === 0) {
        throw new Error("Circle not found");
    }
    return circle;
};

export const getCirclePath = async (circle: Circle): Promise<string> => {
    let serverConfig = await getServerConfig(false);
    if (circle._id === serverConfig.defaultCircleId) {
        return "/";
    }
    return `/circles/${circle.handle}/`;
};
