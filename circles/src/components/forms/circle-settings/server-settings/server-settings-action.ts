import { getAuthenticatedUserDid, getServerPublicKey, isAuthorized } from "@/lib/auth/auth";
import { FormAction, FormSubmitResponse, Page, ServerSettings } from "../../../../models/models";
import { features } from "@/lib/data/constants";
import { getServerSettings, registerServer, updateServerSettings } from "@/lib/data/server-settings";
import { revalidatePath } from "next/cache";

export const serverSettingsFormAction: FormAction = {
    id: "server-settings-form",
    onSubmit: async (values: Record<string, any>, page?: Page, subpage?: string): Promise<FormSubmitResponse> => {
        try {
            //console.log("Saving server settings with values", values);
            let registrySuccess = true;
            let circleId = values.defaultCircleId;

            // check if user is authorized to edit server settings, we use the same permission as for default circle settings
            const userDid = await getAuthenticatedUserDid();
            let authorized = await isAuthorized(userDid, circleId ?? "", features.settings_edit);
            if (!authorized) {
                return { success: false, message: "You are not authorized to edit server settings" };
            }

            // update server settings
            let serverSettings: ServerSettings = {
                name: values.name,
                description: values.description,
                url: values.url,
                registryUrl: values.registryUrl,
                jwtSecret: values.jwtSecret,
                openaiKey: values.openaiKey,
                mapboxKey: values.mapboxKey,
            };

            // get current server settings
            let currentServerSettings = await getServerSettings();

            // if we have no registry information or if current registry URL differs from the specified one, we need to register the server
            if (
                serverSettings.registryUrl &&
                (!currentServerSettings.activeRegistryInfo ||
                    currentServerSettings.activeRegistryInfo.registryUrl !== serverSettings.registryUrl)
            ) {
                // get public key for server
                let publicKey = getServerPublicKey();

                // register server
                try {
                    let registryInfo = await registerServer(
                        currentServerSettings.did!,
                        serverSettings.name!,
                        serverSettings.url!,
                        serverSettings.registryUrl,
                        publicKey,
                    );
                    serverSettings.activeRegistryInfo = registryInfo;
                } catch (error) {
                    console.log("Failed to register server with registry", error);
                    registrySuccess = false;
                }
            }

            // save server settings
            await updateServerSettings(serverSettings);

            revalidatePath(`/${page?.handle}/${subpage}`);

            return {
                success: registrySuccess,
                message: registrySuccess
                    ? "Server settings updated successfully"
                    : "Server settings updated successfully, but failed to register server with registry",
            };
        } catch (error) {
            if (error instanceof Error) {
                return { success: false, message: error.message };
            } else {
                return { success: false, message: "Failed to update server settings. " + error };
            }
        }
    },
};
