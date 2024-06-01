import { redirect } from "next/navigation";
import { Circles, ServerConfigs } from "./data/db";
import { Circle, ServerConfig } from "@/models/models";

export const getServerConfig = async (redirectIfSetup: boolean = false): Promise<ServerConfig> => {
    let serverConfig = await ServerConfigs.findOne({});
    let redirectUrl = null;
    if (!serverConfig) {
        // TODO create a default circle? This could be done after the user is created perhaps
        // let circle: Circle = {
        //     name: "Circles",
        //     description: "Your Social Platform",
        //     handle: "default",
        //     picture: "/images/default-picture.png",
        //     cover: "/images/default-cover.png",
        //     userGroups: ["Admins", "Moderators", "Members", "Guests"],
        // };
        // let result = await Circles.insertOne(circle);

        // initialize server data
        await ServerConfigs.insertOne({ status: "setup", setupStatus: "config" });

        redirectUrl = "/setup";
    } else if (serverConfig.status === "setup") {
        if (serverConfig.setupStatus === "config") {
            redirectUrl = "/setup";
        } else if (serverConfig.setupStatus === "account") {
            redirectUrl = "/signup";
        } else if (serverConfig.setupStatus === "circle") {
            redirectUrl = "/circles/create";
        }
    }

    if (redirectIfSetup && redirectUrl) {
        redirect(redirectUrl);
    }

    return serverConfig as ServerConfig;
};

export const getDefaultCircle = async (
    redirectIfSetup: boolean = false,
    inServerConfig: ServerConfig | null = null,
): Promise<Circle> => {
    let serverConfig = inServerConfig ?? (await getServerConfig(redirectIfSetup));
    let circle = (await Circles.findOne({ did: serverConfig?.defaultCircleDid })) as Circle;
    if (!circle) {
        circle = {
            name: "Circles",
            description: "Your Social Platform",
            handle: "",
            picture: "/images/default-picture.png",
            cover: "/images/default-cover.png",
        };
    }
    return circle;
};
