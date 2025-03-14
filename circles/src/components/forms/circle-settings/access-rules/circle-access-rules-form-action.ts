import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormAction, FormSubmitResponse, Page } from "../../../../models/models";
import { safeModifyAccessRules } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getUserById, updateUser } from "@/lib/data/user";

export const circleAccessRulesFormAction: FormAction = {
    id: "circle-access-rules-form",
    onSubmit: async (values: Record<string, any>, page?: Page, subpage?: string): Promise<FormSubmitResponse> => {
        let circle: Partial<Circle> = {
            _id: values._id,
        };

        // check if user is authorized to edit circle settings
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in to edit circle settings" };
        }

        try {
            let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings_edit);
            if (!authorized) {
                return { success: false, message: "You are not authorized to edit circle settings" };
            }

            // make sure readOnly rows in userGroups are not updated
            let existingCircle = null;
            existingCircle = await getCircleById(values._id);

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
