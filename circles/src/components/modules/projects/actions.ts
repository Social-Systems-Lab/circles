"use server";

import { Circle } from "@/models/models";

export const createProjectAction = async (circle: Circle): Promise<CircleActionResponse> => {
        // check if user is authorized to edit circle settings
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in to create a circle" };
        }

        try {
            let authorized = await isAuthorized(userDid, circle.parentCircleId ?? "", features.create_subcircle);
            if (!authorized) {
                return { success: false, message: "You are not authorized to create new circles" };
            }

            circle.createdBy = userDid;
            let newCircle = await createCircle(circle);

            // add user as admin member to the new circle
            await addMember(userDid, newCircle._id!, ["admins", "moderators", "members"]);

            try {
                let needUpdate = false;
                if (isFile(values.picture)) {
                    // save the picture and get the file info
                    newCircle.picture = await saveFile(values.picture, "picture", newCircle._id, true);
                    needUpdate = true;
                }

                if (isFile(values.cover)) {
                    // save the cover and get the file info
                    newCircle.cover = await saveFile(values.cover, "cover", newCircle._id, true);
                    needUpdate = true;
                }

                if (needUpdate) {
                    await updateCircle(newCircle);
                }
            } catch (error) {
                console.log("Failed to save circle files", error);
            }

            return { success: true, message: "Circle created successfully", data: { circle: newCircle } };
        } catch (error) {
            if (error instanceof Error) {
                return { success: false, message: error.message };
            } else {
                return { success: false, message: "Failed to create the circle. " + JSON.stringify(error) };
            }
        }
    },
};
