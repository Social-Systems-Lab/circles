import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FormSubmitResponse, FormActionHandler, FormTools } from "../../../../models/models";

export const circleAccessRulesFormActionHandler: FormActionHandler = {
    id: "circle-access-rules-form",
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
                title: "Save Error",
                description: response.message,
                variant: "destructive",
                icon: "error",
            });

            return response;
        }

        tools.toast({
            icon: "success",
            title: "Save Succcess",
            description: "Circle Access Rules settings saved successfully",
        });

        return response;
    },
};
