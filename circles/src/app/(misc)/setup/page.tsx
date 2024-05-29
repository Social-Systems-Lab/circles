import { redirect } from "next/navigation";
import ServerSetupForm from "./ServerSetupForm";
import { ServerConfigs } from "@/lib/db";
import { ServerSetupData } from "@/models/models";

export default async function Setup() {
    // check if authorized
    let serverConfig = await ServerConfigs.findOne({});
    if (!serverConfig || serverConfig.status !== "setup") {
        redirect("/");
    }
    const setupData: ServerSetupData = {
        openaiKey: serverConfig?.openaiKey || "",
        mapboxKey: serverConfig?.mapboxKey || "",
    };

    return <ServerSetupForm setupData={setupData} />;
}
