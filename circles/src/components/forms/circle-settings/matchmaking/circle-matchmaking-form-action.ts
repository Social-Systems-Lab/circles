import { FormAction, FormSubmitResponse, Page, Question } from "../../../../models/models";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { updateCircle, getCircleById, getCirclePath } from "@/lib/data/circle";
import { revalidatePath } from "next/cache";
import { getUserById, updateUser } from "@/lib/data/user";

export const circleMatchmakingFormAction: FormAction = {
    id: "circle-matchmaking-form",
    onSubmit: async (values: Record<string, any>, page?: Page, subpage?: string): Promise<FormSubmitResponse> => {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in to edit circle settings" };
        }

        try {
            let circle = null;
            circle = await getCircleById(values._id);

            let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings_edit);
            if (!authorized) {
                return { success: false, message: "You are not authorized to edit circle settings" };
            }
            circle.causes = values.causes;
            circle.skills = values.skills;

            // console.log("Causes", values.causes);
            // console.log("Skills", values.skills);

            await updateCircle(circle);

            // clear page cache so pages update
            let circlePath = await getCirclePath(circle);
            revalidatePath(`${circlePath}${page?.handle}/${subpage}`);

            return {
                success: true,
                message:
                    circle.circleType === "user"
                        ? "Causes and Skills saved successfully"
                        : "Causes and Skills Needed saved successfully",
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
