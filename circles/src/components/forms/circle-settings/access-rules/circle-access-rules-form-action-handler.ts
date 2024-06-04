import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FormSubmitResponse, FormActionHandler } from "../../../../models/models";

export const circleAccessRulesFormActionHandler: FormActionHandler = {
    id: "circle-access-rules-form",
    onHandleSubmit: async (response: FormSubmitResponse, router: AppRouterInstance): Promise<FormSubmitResponse> => {
        if (!response.success) {
            return response;
        }

        // redirect to home page
        router.push("/");
        return response;
    },
};
