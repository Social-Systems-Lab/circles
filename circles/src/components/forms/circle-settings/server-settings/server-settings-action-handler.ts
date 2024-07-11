import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FormSubmitResponse, FormActionHandler, FormTools } from "../../../../models/models";

export const serverSettingsFormActionHandler: FormActionHandler = {
    id: "server-settings-form",
    onHandleSubmit: async (
        response: FormSubmitResponse,
        router: AppRouterInstance,
        tools: FormTools,
    ): Promise<FormSubmitResponse> => {
        if (!response) {
            return { success: false, message: "No response" };
        }

        if (!response.success) {
            tools.toast({
                title: "Configuration Error",
                description: response.message,
                variant: "destructive",
                icon: "error",
            });

            return response;
        }

        tools.toast({
            icon: "success",
            title: "Configuration Updated",
            description: "Server configuration updated successfully",
        });

        return response;
    },
};
