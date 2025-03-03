import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FormSubmitResponse, FormActionHandler, FormTools } from "@/models/models";
import { getUserPrivateAction } from "@/components/modules/home/actions";

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

        // Get the newly created circle
        let circle = response.data.circle;

        // Update the user's data to include the new membership before navigating
        if (tools.user?.did) {
            try {
                // Fetch the latest user data including the new membership
                const updatedUser = await getUserPrivateAction();

                // Update the user atom with the refreshed data
                tools.setUser(updatedUser!);

                console.log("User data refreshed with new circle membership");
            } catch (error) {
                console.error("Failed to refresh user data:", error);
            }
        }

        // Navigate to the new circle
        router.push(`/circles/${circle.handle}`);

        return response;
    },
};
