import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FormSubmitResponse, FormActionHandler, FormTools } from "@/models/models";

export const createCircleFormActionHandler: FormActionHandler = {
    id: "create-circle-form",
    onHandleSubmit: async (
        response: FormSubmitResponse,
        router: AppRouterInstance,
        tools: FormTools,
    ): Promise<FormSubmitResponse> => {
        if (!response.success) {
            return response;
        }

        tools.toast({ title: "Success", description: "Circle created successfully" });

        // navigate to new circle
        let circle = response.data.circle;
        router.push(`/circles/${circle.handle}`);

        return response;
    },
};
