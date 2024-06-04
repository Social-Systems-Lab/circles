import { redirect } from "next/navigation";
import { Circles, ServerConfigs } from "./db";
import { Circle, ServerConfig } from "@/models/models";
import { createDefaultCircle } from "./circle";

export const getServerConfig = async (redirectIfSetup: boolean = false): Promise<ServerConfig> => {
    let serverConfig = await ServerConfigs.findOne({});
    let redirectUrl = null;

    if (!serverConfig) {
        // initialize server data
        await ServerConfigs.insertOne({ status: "setup", setupStatus: "config" });

        redirectUrl = "/setup";
    } else if (serverConfig.status === "setup") {
        if (serverConfig.setupStatus === "config") {
            redirectUrl = "/setup";
        } else if (serverConfig.setupStatus === "account") {
            redirectUrl = "/signup";
        }
    }

    if (!serverConfig?.defaultCircleId) {
        console.log("Creating default circle");

        // create a default circle
        let circle = createDefaultCircle();
        let result = await Circles.insertOne(circle);
        await ServerConfigs.updateOne({}, { $set: { defaultCircleId: result.insertedId.toString() } });
    }

    if (redirectIfSetup && redirectUrl) {
        redirect(redirectUrl);
    }

    return serverConfig as ServerConfig;
};
