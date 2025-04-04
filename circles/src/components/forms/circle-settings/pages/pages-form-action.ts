import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormSubmitResponse, Page } from "../../../../models/models";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";

export async function updateCirclePages(values: { _id: any; pages: Page[] }): Promise<FormSubmitResponse> {
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
            circle.pages = circle.pages.map((page) => {
                const existingPage = existingCircle.pages?.find((p) => p.handle === page.handle);
                if (existingPage?.readOnly) {
                    return { ...page, readOnly: true };
                }
                return page;
            });
        }

        // update the circle
        await updateCircle(circle);

        // clear page cache so pages update
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}/settings/pages`);

        return { success: true, message: "Circle pages saved successfully" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save circle pages. " + JSON.stringify(error) };
        }
    }
}
