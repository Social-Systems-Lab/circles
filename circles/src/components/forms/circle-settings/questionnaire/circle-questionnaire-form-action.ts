import { FormAction, FormSubmitResponse, Page, Question } from "../../../../models/models";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { updateCircle, getCircleById, getCirclePath } from "@/lib/data/circle";
import { revalidatePath } from "next/cache";

export const circleQuestionnaireFormAction: FormAction = {
    id: "circle-questionnaire-form",
    onSubmit: async (values: Record<string, any>, page?: Page, subpage?: string): Promise<FormSubmitResponse> => {
        try {
            const userDid = await getAuthenticatedUserDid();
            const circle = await getCircleById(values._id);

            let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings_edit);
            if (!authorized) {
                return { success: false, message: "You are not authorized to edit circle settings" };
            }
            const questionnaire: Question[] = values.questionnaire;

            circle.questionnaire = questionnaire;
            await updateCircle(circle);

            // clear page cache so pages update
            let circlePath = await getCirclePath(circle);
            revalidatePath(`${circlePath}${page?.handle}/${subpage}`);

            return { success: true, message: "Questionnaire saved successfully" };
        } catch (error) {
            if (error instanceof Error) {
                return { success: false, message: error.message };
            } else {
                return { success: false, message: "Failed to save questionnaire. " + error };
            }
        }
    },
};
