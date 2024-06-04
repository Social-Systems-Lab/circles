import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FormSubmitResponse, FormActionHandler } from "../../../../models/models";

export const circleSettingsFormActionHandler: FormActionHandler = {
    id: "circle-about-form",
    onHandleSubmit: async (response: FormSubmitResponse, router: AppRouterInstance): Promise<FormSubmitResponse> => {
        if (!response.success) {
            return response;
        }

        // redirect to home page
        router.push("/");
        return response;
    },
};
