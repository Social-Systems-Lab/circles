import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { ServerConfigs } from "@/lib/db";
import { LoginData } from "@/models/models";
import { AiWizard } from "@/components/ai/ai-wizard";
import { aiWizardContexts } from "@/models/ai-wizard-contexts";

export default async function Login() {
    // check if authorized
    let serverConfig = await ServerConfigs.findOne({});
    let loginData: LoginData = {
        email: "",
        aiEnabled: false,
    };
    if (serverConfig?.openaiKey) {
        loginData.aiEnabled = true;
    }

    return <AiWizard initialContext={aiWizardContexts["logged-out-welcome"]} />;
    // return <LoginForm loginData={loginData} />;
}
