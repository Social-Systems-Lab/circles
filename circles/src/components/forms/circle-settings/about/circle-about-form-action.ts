import { updateCircle } from "@/lib/data/circle";
import { Circle, FormAction, FormSubmitResponse } from "../../../../models/models";

export const circleAboutFormAction: FormAction = {
    id: "circle-about-form",
    onSubmit: async (values: Record<string, any>): Promise<FormSubmitResponse> => {
        try {
            console.log("Saving circle settings with values", values);
            // TODO check if user is authorized to save circle settings

            // convert record to circle object
            let circle: Circle = {
                _id: values._id,
                name: values.name,
                handle: values.handle,
            };
            await updateCircle(circle);

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
