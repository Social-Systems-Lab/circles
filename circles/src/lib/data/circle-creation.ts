import type { Circle, Member } from "@/models/models";
import { createCircle, deleteNewlyCreatedCircle } from "./circle";
import { addMember } from "./member";

type CircleCreationDependencies = {
    createCircle: typeof createCircle;
    addMember: typeof addMember;
    deleteCircle: typeof deleteNewlyCreatedCircle;
};

const defaultDependencies: CircleCreationDependencies = { createCircle, addMember, deleteCircle: deleteNewlyCreatedCircle };

export async function createCircleWithCanonicalCreatorMembership(
    circle: Circle,
    authenticatedUserDid: string,
    dependencies: CircleCreationDependencies = defaultDependencies,
): Promise<{ circle: Circle; membership: Member }> {
    const createdCircle = await dependencies.createCircle(circle, authenticatedUserDid);
    const circleId = createdCircle._id?.toString();
    if (!circleId) throw new Error("Created circle is missing its canonical ID.");

    try {
        const membership = await dependencies.addMember(authenticatedUserDid, circleId, [
            "admins",
            "moderators",
            "members",
        ]);
        return { circle: createdCircle, membership };
    } catch (error) {
        if (createdCircle.visibility === "secret") {
            try {
                await dependencies.deleteCircle(circleId);
            } catch (cleanupError) {
                console.error("Failed to clean up Secret Circle after creator membership failure", {
                    circleId,
                    cleanupError,
                });
                throw new Error("Secret Circle creation failed and cleanup requires recovery.", { cause: error });
            }
        }
        throw error;
    }
}
