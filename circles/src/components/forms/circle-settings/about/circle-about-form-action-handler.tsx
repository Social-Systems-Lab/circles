import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FormSubmitResponse, FormActionHandler, FormTools } from "../../../../models/models";
import { CheckIcon } from "lucide-react";

export const circleAboutFormActionHandler: FormActionHandler = {
    id: "circle-about-form",
    onHandleSubmit: async (
        response: FormSubmitResponse,
        router: AppRouterInstance,
        tools: FormTools,
    ): Promise<FormSubmitResponse> => {
        console.log("response", response);
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
            description: "Circle About settings saved successfully",
        });

        // redirect to home page
        //router.push("/");
        return response;
    },
};