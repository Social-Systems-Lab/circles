import { FormAction, FormSubmitResponse } from "@/models/models";

export const circleGeneralFormAction: FormAction = {
    id: "circle-general-form",
    onSubmit: async (values: Record<string, any>): Promise<FormSubmitResponse> => {
        try {
            // This form doesn't have any fields to save directly
            // It's mainly used for the delete circle functionality which is handled by a separate action

            return {
                success: true,
                message: "Settings saved successfully",
            };
        } catch (error) {
            console.error("Error saving general settings:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "An unknown error occurred",
            };
        }
    },
};
