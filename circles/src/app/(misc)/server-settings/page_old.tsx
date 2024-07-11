import { redirect } from "next/navigation";
import ServerSetupForm from "./server-setup-form";
import { ServerSettingsCollection } from "@/lib/data/db";
import { ServerSetupData } from "@/models/models";

export default async function Setup() {
    // check if authorized
    let serverConfig = await ServerSettingsCollection.findOne({});
    if (!serverConfig || serverConfig.status !== "setup") {
        redirect("/");
    }
    const setupData: ServerSetupData = {
        openaiKey: serverConfig?.openaiKey || "",
        mapboxKey: serverConfig?.mapboxKey || "",
    };

    return <ServerSetupForm setupData={setupData} />;
}
