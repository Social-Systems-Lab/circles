import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FormSubmitResponse, FormActionHandler, FormTools } from "../../../../models/models";

export const circleMatchmakingFormActionHandler: FormActionHandler = {
    id: "circle-matchmaking-form",
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
            description: "Circle settings saved successfully",
        });

        return response;
    },
};
