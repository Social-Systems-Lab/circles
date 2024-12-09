import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormAction, FormSubmitResponse, Page } from "../../../../models/models";
import { revalidatePath } from "next/cache";
import { addPagesAccessRules, safeModifyArray } from "@/lib/utils";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getUserById, updateUser } from "@/lib/data/user";

export const circlePagesFormAction: FormAction = {
    id: "circle-pages-form",
    onSubmit: async (values: Record<string, any>, page?: Page, subpage?: string): Promise<FormSubmitResponse> => {
        console.log("Saving circle settings with values", values);

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

            const finalPages = safeModifyArray(existingCircle.pages || [], values.pages || []);
            circle.pages = finalPages;

            // make sure access rules exists for all pages
            const finalAccessRules = addPagesAccessRules(finalPages, existingCircle.accessRules ?? {});
            circle.accessRules = finalAccessRules;

            // TODO remove, resets to default access rules to circle for testing
            // circle.pages = defaultPages;

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
