import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormAction, FormSubmitResponse, Page } from "../../../../models/models";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";

export const circlePagesFormAction: FormAction = {
    id: "circle-pages-form",
    onSubmit: async (values: Record<string, any>, page?: Page, subpage?: string): Promise<FormSubmitResponse> => {
        console.log("Saving circle pages with values", values);

        let circle: Partial<Circle> = {
            _id: values._id,
            pages: values.pages,
        };

        // check if user is authorized to edit circle settings
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in to edit circle settings" };
        }

        let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings.edit_pages);
        try {
            if (!authorized) {
                return { success: false, message: "You are not authorized to edit circle settings" };
            }

            // make sure readOnly pages are not updated
            let existingCircle = await getCircleById(values._id);
            if (!existingCircle) {
                throw new Error("Circle not found");
            }

            // Preserve readOnly status from existing pages
            if (existingCircle.pages && circle.pages) {
                circle.pages = circle.pages.map((p) => {
                    const existingPage = existingCircle.pages?.find((ep) => ep.handle === p.handle);
                    if (existingPage?.readOnly) {
                        return { ...p, readOnly: true };
                    }
                    return p;
                });
            }

            // update the circle
            await updateCircle(circle);

            // clear page cache so pages update
            let circlePath = await getCirclePath(circle);
            revalidatePath(`${circlePath}${page?.handle}/${subpage}`);

            return { success: true, message: "Circle pages saved successfully" };
        } catch (error) {
            if (error instanceof Error) {
                return { success: false, message: error.message };
            } else {
                return { success: false, message: "Failed to save circle pages. " + JSON.stringify(error) };
            }
        }
    },
};
