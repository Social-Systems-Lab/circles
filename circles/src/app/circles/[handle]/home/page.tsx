import React from "react";
import { notFound } from "next/navigation";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import AboutPage from "@/components/modules/home/AboutPage";
import type { VerifiedContributionItem } from "@/components/modules/home/VerifiedContributionsPanel";
import { getVerifiedTasksForUser } from "@/lib/data/task";
import { features } from "@/lib/data/constants";
import type { TaskPermissions } from "@/models/models";

// TODO: Add error handling and loading states more robustly

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function CircleHomePage(props: PageProps) {
    const { handle } = await props.params;
    const viewerDid = await getAuthenticatedUserDid();

    // Fetch circle data
    const circle = await getCircleByHandle(handle);
    if (!circle) {
        notFound();
    }

    let verifiedContributions: VerifiedContributionItem[] = [];

    if (circle.circleType === "user" && circle.did) {
        const verifiedTasks = await getVerifiedTasksForUser(circle.did, viewerDid);
        const permissionsByCircleId = new Map<string, TaskPermissions>();

        verifiedContributions = (
            await Promise.all(
                verifiedTasks.map(async (task) => {
                    if (!task.circle?._id) {
                        return null;
                    }

                    let permissions = permissionsByCircleId.get(task.circle._id);
                    if (!permissions) {
                        permissions = {
                            canModerate: await isAuthorized(viewerDid, task.circle._id, features.tasks.moderate),
                            canReview: await isAuthorized(viewerDid, task.circle._id, features.tasks.review),
                            canAssign: await isAuthorized(viewerDid, task.circle._id, features.tasks.assign),
                            canResolve: await isAuthorized(viewerDid, task.circle._id, features.tasks.resolve),
                            canComment: await isAuthorized(viewerDid, task.circle._id, features.tasks.comment),
                        };
                        permissionsByCircleId.set(task.circle._id, permissions);
                    }

                    return {
                        task,
                        circle: task.circle,
                        permissions,
                    };
                }),
            )
        ).filter((item): item is VerifiedContributionItem => item !== null);
    }

    return <AboutPage circle={circle} verifiedContributions={verifiedContributions} />;
}
