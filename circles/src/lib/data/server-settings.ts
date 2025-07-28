import { redirect } from "next/navigation";
import { Sdgs, Circles, ServerSettingsCollection, Skills } from "./db";
import { Circle, RegistryInfo, ServerSettings } from "@/models/models";
import { createDefaultCircle } from "./circle";
import { ObjectId } from "mongodb";
import { createServerDid, getServerPublicKey, signRegisterServerChallenge } from "../auth/auth";
import { sdgs } from "@/lib/data/sdgs";
import { skills } from "@/lib/data/skills";

const ENV_TO_SETTINGS_MAP: Record<string, keyof ServerSettings> = {
    CIRCLES_INSTANCE_NAME: "name",
    CIRCLES_URL: "url",
    CIRCLES_REGISTRY_URL: "registryUrl",
    CIRCLES_JWT_SECRET: "jwtSecret",
    OPENAI_API_KEY: "openaiKey",
    MAPBOX_API_KEY: "mapboxKey",
};

export const upsertSdgsAndSkills = async () => {
    try {
        // Upsert sdgs
        for (const sdg of sdgs) {
            await Sdgs.updateOne(
                { handle: sdg.handle }, // Find the document by handle
                {
                    $set: {
                        name: sdg.name,
                        picture: sdg.picture,
                        description: sdg.description,
                    },
                },
                { upsert: true }, // Insert if it doesn't exist, update if it does
            );
        }
        console.log("All sdgs upserted successfully.");

        // Upsert skills
        for (const skill of skills) {
            await Skills.updateOne(
                { handle: skill.handle }, // Find the document by handle
                {
                    $set: {
                        name: skill.name,
                        picture: skill.picture,
                        description: skill.description,
                    },
                },
                { upsert: true }, // Insert if it doesn't exist, update if it does
            );
        }
        console.log("All skills upserted successfully.");
    } catch (error) {
        console.error("Error upserting sdgs or skills:", error);
    }
};

export const getServerSettings = async (): Promise<ServerSettings> => {
    if (process.env.IS_BUILD === "true") {
        // return dummy settings
        return {
            name: "Circles",
            url: "http://localhost:3000",
            registryUrl: "http://localhost:3001",
            defaultCircleId: "default",
        };
    }

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
    //     await Circles.updateOne({ _id: new ObjectId(serverSettings.defaultCircleId) }, { $set: circle });
    // }

    if (serverSettings && !serverSettings?.did) {
        // generate a new DID
        let serverDid = await createServerDid();
        await ServerSettingsCollection.updateOne({}, { $set: { did: serverDid.did } });
        serverSettings.did = serverDid.did;
    }

    // TODO uncommented below because is called multiple times, registry is now done when server settings is saved
    // if (serverSettings && serverSettings?.did && !serverSettings?.activeRegistryInfo) {
    //     // register server with registry if registry URL is set
    //     if (serverSettings.registryUrl) {
    //         let localServerAndRemoteRegistry =
    //             urlIsLocal(serverSettings.url) && !urlIsLocal(serverSettings.registryUrl);
    //         if (!localServerAndRemoteRegistry) {
    //             try {
    //                 let publicKey = getServerPublicKey();
    //                 let registryInfo = await registerServer(
    //                     serverSettings.did,
    //                     serverSettings.name!,
    //                     serverSettings.url!,
    //                     serverSettings.registryUrl,
    //                     publicKey,
    //                 );
    //                 serverSettings.activeRegistryInfo = registryInfo;

    //                 // save updated server settings
    //                 await ServerSettingsCollection.updateOne({}, { $set: { activeRegistryInfo: registryInfo } });
    //             } catch (error) {
    //                 console.error("Failed to register server with registry", error);
    //             }
    //         }
    //     }
    // }

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
    let result = await ServerSettingsCollection.updateOne({}, { $set: serverSettingsWithoutId });
    if (result.matchedCount === 0) {
        throw new Error("Server settings not found");
    }
};

export const urlIsLocal = (url: string | undefined): boolean => {
    if (!url) return true;

    return (
        url.startsWith("http://localhost") ||
        url.startsWith("localhost") ||
        url.startsWith("http://127.0.0.1") ||
        url.startsWith("127.0.0.1")
    );
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

    // if registry isn't local make sure server URL isn't local
    if (!urlIsLocal(registryUrl)) {
        if (urlIsLocal(url)) {
            throw new Error("Cannot register server with local URL"); // TODO uncomment when done testing
        }
    }

    // make a register request to the registry
    let registerResponse = await fetch(`${registryUrl}/servers/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ did, name, url, publicKey }),
        cache: "no-store",
    });

    let registerData = await registerResponse.json();
    if (registerResponse.status !== 200) {
        throw new Error("Failed to register server");
    }

    // sign the challenge
    const signature = signRegisterServerChallenge(registerData.challenge);

    // confirm registration
    let confirmResponse = await fetch(`${registryUrl}/servers/register-confirm`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ did, challenge: registerData.challenge, signature }),
        cache: "no-store",
    });

    let confirmResponseObject = await confirmResponse.json();

    if (confirmResponse.status !== 200) {
        throw new Error("Failed to confirm registration");
    }

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
