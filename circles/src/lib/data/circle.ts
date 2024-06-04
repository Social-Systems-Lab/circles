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
    let circle = (await Circles.findOne(
        { _id: new ObjectId(serverConfig?.defaultCircleId) },
        { projection: { _id: 0 } },
    )) as Circle;
    if (!circle) {
        circle = createDefaultCircle();
    }
    return circle;
};

export const createDefaultCircle = (): Circle => {
    let circle: Circle = {
        name: "Circles",
        description: "Your Social Platform",
        handle: "default",
        picture: "/images/default-picture.png",
        cover: "/images/default-cover.png",
        userGroups: [
            {
                name: "Admins",
                handle: "admins",
                description: "Administrators of the circle",
            },
            {
                name: "Moderators",
                handle: "moderators",
                description: "Moderators of the circle",
            },
            {
                name: "Members",
                handle: "members",
                description: "Members of the circle",
            },
        ],
        pages: defaultPages,
    };
    return circle;
};

export const getCircleByHandle = async (handle: string): Promise<Circle> => {
    let circle = (await Circles.findOne({ handle: handle }, { projection: { _id: 0 } })) as Circle;
    return circle;
};
