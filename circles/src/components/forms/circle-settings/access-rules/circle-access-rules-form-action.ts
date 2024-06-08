import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormAction, FormSubmitResponse, Page } from "../../../../models/models";
import { safeModifyAccessRules } from "@/lib/utils";
import { revalidatePath } from "next/cache";

export const circleAccessRulesFormAction: FormAction = {
    id: "circle-access-rules-form",
    onSubmit: async (values: Record<string, any>, page?: Page, subpage?: string): Promise<FormSubmitResponse> => {
        try {
            // TODO check if user is authorized to save circle settings
            console.log("Saving circle settings with values", values);

            let circle: Circle = {
                _id: values._id,
            };

            // make sure readOnly rows in userGroups are not updated
            const existingCircle = await getCircleById(values._id);
            if (!existingCircle) {
                throw new Error("Circle not found");
            }

            const finalAccessRules = safeModifyAccessRules(existingCircle.accessRules, values.accessRules);
            circle.accessRules = finalAccessRules;

            // update the circle
            await updateCircle(circle);

            // clear page cache so pages update
            let circlePath = await getCirclePath(circle);
            revalidatePath(`${circlePath}${page?.handle}/${subpage}`);

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
