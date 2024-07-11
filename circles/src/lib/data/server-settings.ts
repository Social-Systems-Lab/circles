import { redirect } from "next/navigation";
import { Circles, ServerSettingsCollection } from "./db";
import { Circle, RegistryInfo, ServerSettings } from "@/models/models";
import { createDefaultCircle } from "./circle";
import { ObjectId } from "mongodb";
import { createServerDid } from "../auth/auth";

const ENV_TO_SETTINGS_MAP: Record<string, keyof ServerSettings> = {
    CIRCLES_INSTANCE_NAME: "name",
    CIRCLES_URL: "url",
    CIRCLES_REGISTRY_URL: "registryUrl",
    CIRCLES_JWT_SECRET: "jwtSecret",
    OPENAI_API_KEY: "openaiKey",
    MAPBOX_API_KEY: "mapboxKey",
};

export const getServerSettings = async (): Promise<ServerSettings> => {
    let serverSettings = await ServerSettingsCollection.findOne({});
    if (!serverSettings) {
        // initialize server data
        await ServerSettingsCollection.insertOne({});
    }

    if (!serverSettings?.defaultCircleId) {
        // create a default circle
        let circle = createDefaultCircle();
        let result = await Circles.insertOne(circle);
        await ServerSettingsCollection.updateOne({}, { $set: { defaultCircleId: result.insertedId.toString() } });

        // get updated server settings
        serverSettings = await ServerSettingsCollection.findOne({});
    }
    // Uncomment to reset default circle
    // else {
    //     // replace default circle with new default circle
    //     let circle = createDefaultCircle();
    //     console.log("Creating new default circle", circle);
    //     await Circles.updateOne({ _id: new ObjectId(serverConfig.defaultCircleId) }, { $set: circle });
    // }

    if (serverSettings && !serverSettings?.did) {
        // generate a new DID
        let serverDid = await createServerDid();
        await ServerSettingsCollection.updateOne({}, { $set: { did: serverDid.did } });
        serverSettings.did = serverDid.did;

        // register server with registry if registry URL is set
        if (serverSettings.registryUrl) {
            try {
                let registryInfo = await registerServer(
                    serverSettings.did,
                    serverSettings.name!,
                    serverSettings.url!,
                    serverSettings.registryUrl,
                    serverDid.publicKey,
                );
                serverSettings.activeRegistryInfo = registryInfo;

                // save updated server settings
                await ServerSettingsCollection.updateOne({}, { $set: { activeRegistryInfo: registryInfo } });
            } catch (error) {
                console.error("Failed to register server", error);
            }
        }
    }

    // get environment variables
    let settings = serverSettings as ServerSettings;
    for (const [envKey, settingKey] of Object.entries(ENV_TO_SETTINGS_MAP)) {
        if (!serverSettings![settingKey]) {
            if (process.env[envKey]) {
                settings[settingKey] = process.env[envKey] as never;
            }
        }
    }
    settings._id = settings._id?.toString();

    return serverSettings as ServerSettings;
};

export const updateServerSettings = async (serverSettings: ServerSettings): Promise<void> => {
    let { _id, ...serverSettingsWithoutId } = serverSettings;
    let result = await ServerSettingsCollection.updateOne(
        { _id: new ObjectId(_id) },
        { $set: serverSettingsWithoutId },
    );
    if (result.matchedCount === 0) {
        throw new Error("Server settings not found");
    }
};

export const registerServer = async (
    did: string,
    name: string,
    url: string,
    registryUrl: string,
    publicKey: string,
): Promise<RegistryInfo> => {
    if (!did || !name || !url || !registryUrl || !publicKey) {
        throw new Error("Invalid server registration data");
    }

    // make a register request to the registry
    let registerResponse = await fetch(`${registryUrl}/servers/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ did, name, url, publicKey }),
    });

    if (registerResponse.status !== 200) {
        console.log("Failed to register server", registerResponse);
        throw new Error("Failed to register server");
    }

    // sign the challenge
    let registerData = await registerResponse.json();
    console.log("Received register response", registerData);
    const signature = "dummy signature"; //signChallenge(privateKey, registerData.challenge);

    // confirm registration
    let confirmResponse = await fetch(`${registryUrl}/servers/register-confirm`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ did, signature }),
    });

    if (confirmResponse.status !== 200) {
        throw new Error("Failed to confirm registration");
    }

    let confirmResponseObject = await confirmResponse.json();
    if (!confirmResponseObject.success) {
        throw new Error("Failed to confirm registration");
    }

    let registryInfo: RegistryInfo = {
        registryUrl,
        registeredAt: new Date(),
    };
    console.log("Received confirm response", confirmResponseObject);
    return registryInfo;
};
