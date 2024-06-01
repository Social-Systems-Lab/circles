import { FormAction, FormSubmitResponse } from "../../../models/models";

export const circleSettingsFormAction: FormAction = {
    id: "circel-settings-form",
    onSubmit: async (values: Record<string, any>): Promise<FormSubmitResponse> => {
        try {
            return { success: true, message: "Circle settings saved successfully" };
        } catch (error) {
            if (error instanceof Error) {
                return { success: false, message: error.message };
            } else {
                return { success: false, message: "Failed to save circle settings. " + JSON.stringify(error) };
            }
        }
    },
};
