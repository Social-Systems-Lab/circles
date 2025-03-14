import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FormSubmitResponse, FormActionHandler, FormTools } from "../../../models/models";

export const loginFormActionHandler: FormActionHandler = {
    id: "login-form",
    onHandleSubmit: async (
        response: FormSubmitResponse,
        router: AppRouterInstance,
        tools: FormTools,
    ): Promise<FormSubmitResponse> => {
        if (!response.success) {
            return response;
        }

        // set logged in user and authenticate status
        tools.setUser(response.data.user);
        tools.setAuthenticated(true);

        // redirect to requested page
        let redirectUrl = tools.searchParams?.get("redirectTo") ?? `/circles/${response.data.user.handle}`;
        router.push(redirectUrl);
        return response;
    },
};
