"use server";

import { ServerSetupData, OpenAIFormType, MapboxFormType, mapboxFormSchema, openAIFormSchema } from "@/models/models";
import { ServerConfigs } from "@/lib/db";

type ActionResponse = {
    message?: string;
    success: boolean;
};

export async function isAuthorized(): Promise<boolean> {
    let serverConfig = await ServerConfigs.findOne({});
    if (!serverConfig || serverConfig.status !== "setup") {
        // TODO check if user is admin
        return false;
    }
    return true;
}

export async function completeServerConfig(): Promise<ActionResponse> {
    // verify user is authorized
    let authorized = await isAuthorized();
    if (!authorized) {
        return {
            message: "Unauthorized",
            success: false,
        };
    }

    // TODO check if there are any users in the database
    // TODO check if there are circles in the database
    //let userCount = await Users.countDocuments({});
    //let circlesCount = await Circles.countDocuments({});
    await ServerConfigs.updateOne({}, { $set: { setup_status: "account" } });

    return {
        message: "Server setup complete",
        success: true,
    };
}

export async function saveOpenAIKeyAction(clientData: OpenAIFormType): Promise<ActionResponse> {
    const data = openAIFormSchema.safeParse(clientData);

    if (!data.success) {
        return {
            success: false,
            message: "Invalid OpenAI API key",
        };
    }

    // verify user is authorized
    let authorized = await isAuthorized();
    if (!authorized) {
        return {
            message: "Unauthorized",
            success: false,
        };
    }

    // store OpenAI key
    await ServerConfigs.updateOne({}, { $set: { openaiKey: data.data.openaiKey } });

    return {
        message: "OpenAI API key saved",
        success: true,
    };
}

export async function saveMapboxKeyAction(clientData: MapboxFormType): Promise<ActionResponse> {
    const data = mapboxFormSchema.safeParse(clientData);

    if (!data.success) {
        return {
            success: false,
            message: "Invalid Mapbox API key",
        };
    }

    // verify user is authorized
    let authorized = await isAuthorized();
    if (!authorized) {
        return {
            message: "Unauthorized",
            success: false,
        };
    }

    // store Mapbox API key
    await ServerConfigs.updateOne({}, { $set: { mapboxKey: data.data.mapboxKey } });

    return {
        message: "Mapbox API key saved",
        success: true,
    };
}
