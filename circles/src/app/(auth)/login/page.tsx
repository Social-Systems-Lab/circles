import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { ServerConfigs } from "@/lib/db";
import { LoginData } from "@/models/models";
import { SmartForm } from "@/components/smart-form/smart-form";

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

    return <SmartForm />;
    // return <LoginForm loginData={loginData} />;
}
