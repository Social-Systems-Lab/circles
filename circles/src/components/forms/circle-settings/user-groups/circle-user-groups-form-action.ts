import { getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormAction, FormSubmitResponse, Page } from "../../../../models/models";
import { getServerConfig } from "@/lib/data/server-config";
import { revalidatePath } from "next/cache";

export const circleUserGroupsFormAction: FormAction = {
    id: "circle-user-groups-form",
    onSubmit: async (values: Record<string, any>, page?: Page, subpage: string): Promise<FormSubmitResponse> => {
        try {
            // TODO check if user is authorized to save circle settings
            console.log("Saving circle settings with values", values);

            let circle: Circle = {
                _id: values._id,
                userGroups: values.userGroups,
            };

            await updateCircle(circle);

            // clear page cache so pages update
            let circlePath = await getCirclePath(circle);
            console.log("revalidating path", `${circlePath}${page?.handle}/${subpage}`);
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
