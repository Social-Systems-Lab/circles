import { FormAction, FormSubmitResponse, Page, Question } from "../../../../models/models";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { updateCircle, getCircleById, getCirclePath } from "@/lib/data/circle";
import { revalidatePath } from "next/cache";
import { getUserById, updateUser } from "@/lib/data/user";

export const circleMatchmakingFormAction: FormAction = {
    id: "circle-matchmaking-form",
    onSubmit: async (
        values: Record<string, any>,
        page?: Page,
        subpage?: string,
        isUser?: boolean,
    ): Promise<FormSubmitResponse> => {
        try {
            const userDid = await getAuthenticatedUserDid();
            let circle = null;
            if (isUser) {
                circle = await getUserById(values._id);
            } else {
                circle = await getCircleById(values._id);
            }

            let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings_edit, isUser);
            if (!authorized) {
                return { success: false, message: "You are not authorized to edit circle settings" };
            }
            circle.interests = values.interests;
            circle.offers_needs = values.offers_needs;

            if (isUser) {
                await updateUser(circle);
            } else {
                await updateCircle(circle);
            }

            // clear page cache so pages update
            let circlePath = await getCirclePath(circle);
            revalidatePath(`${circlePath}${page?.handle}/${subpage}`);

            return {
                success: true,
                message: isUser ? "Interests and Offers saved successfully" : "Interests and Needs saved successfully",
            };
        } catch (error) {
            if (error instanceof Error) {
                return { success: false, message: error.message };
            } else {
                return { success: false, message: "Failed to save matchmaking. " + error };
            }
        }
    },
};
