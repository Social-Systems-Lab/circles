import type { VerifiedContributionItem } from "@/components/modules/home/VerifiedContributionsPanel";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getVerifiedTasksForUser } from "@/lib/data/task";
import type { TaskPermissions } from "@/models/models";

type ProfileContributionPanelDependencies = {
    authorize: typeof isAuthorized;
};

const defaultDependencies: ProfileContributionPanelDependencies = {
    authorize: isAuthorized,
};

export async function getProfileContributionPanelData(
    profileDid: string,
    viewerDid: Awaited<ReturnType<typeof getAuthenticatedUserDid>>,
    dependencies: ProfileContributionPanelDependencies = defaultDependencies,
): Promise<{ items: VerifiedContributionItem[]; totalPublicCount: number }> {
    const { totalPublicCount, visibleTasks } = await getVerifiedTasksForUser(profileDid, viewerDid);
    const permissionsByCircleId = new Map<string, TaskPermissions>();

    const items = (
        await Promise.all(
            visibleTasks.map(async (task) => {
                if (!task.circle?._id) return null;

                const circleId = task.circle._id.toString();
                let permissions = permissionsByCircleId.get(circleId);
                if (!permissions) {
                    permissions = {
                        canModerate: await dependencies.authorize(viewerDid, circleId, features.tasks.moderate),
                        canReview: await dependencies.authorize(viewerDid, circleId, features.tasks.review),
                        canAssign: await dependencies.authorize(viewerDid, circleId, features.tasks.assign),
                        canResolve: await dependencies.authorize(viewerDid, circleId, features.tasks.resolve),
                        canComment: await dependencies.authorize(viewerDid, circleId, features.tasks.comment),
                    };
                    permissionsByCircleId.set(circleId, permissions);
                }

                return {
                    task,
                    circle: task.circle,
                    permissions,
                };
            }),
        )
    ).filter((item): item is VerifiedContributionItem => item !== null);

    return { items, totalPublicCount };
}
