// Goals.tsx
"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
// Import the modified action
import { getGoalsAction } from "@/app/circles/[handle]/goals/actions";
import { redirect } from "next/navigation";
// GoalPermissions is still needed for passing down to GoalsList
import { Circle, GoalPermissions } from "@/models/models";
import GoalsList from "./goal-list";
import GoalTimeline from "./goal-timeline";

type PageProps = {
    circle: Circle;
};

export default async function GoalsModule({ circle }: PageProps) {
    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    const circleId = circle._id as string; // Use consistent variable

    // Check if user has permission to view goals
    const canViewGoals = await isAuthorized(userDid, circleId, features.goals.view);
    if (!canViewGoals) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to view goals in this circle.</p>
            </div>
        );
    }

    // --- Updated Data Fetching ---
    // Call the updated getGoalsAction (no boolean argument needed)
    // It now returns an object with goals and ranking stats
    const goalsData = await getGoalsAction(circle.handle as string);

    // Perform permission checks needed by GoalsList or for filtering here
    const canModerateGoal = await isAuthorized(userDid, circleId, features.goals.moderate);
    const canReviewGoal = await isAuthorized(userDid, circleId, features.goals.review);
    const canResolveGoal = await isAuthorized(userDid, circleId, features.goals.resolve);
    const canCommentOnGoal = await isAuthorized(userDid, circleId, features.goals.comment);
    const canCreateGoal = await isAuthorized(userDid, circleId, features.goals.create); // Fetch create permission

    // --- Optional Filtering (Keep or Remove based on requirements) ---
    // Filter goals based on permissions before passing to the list component
    // This example keeps the 'review' stage filtering
    const filteredGoalsData = {
        ...goalsData, // Keep other stats like hasUserRanked, totalRankers, unrankedCount
        goals: goalsData.goals.filter((goal) => {
            // Allow user to always see their own goals
            if (goal.author.did === userDid) return true;

            // Hide 'review' stage goals if user cannot review or moderate
            if (goal.stage === "review" && !(canReviewGoal || canModerateGoal)) {
                return false;
            }
            // Add other top-level filtering if needed
            return true;
        }),
    };

    // Prepare permissions object for GoalsList
    const permissions: GoalPermissions = {
        canModerate: canModerateGoal,
        canReview: canReviewGoal,
        canResolve: canResolveGoal,
        canComment: canCommentOnGoal,
    };

    return (
        <div className="flex w-full flex-col">
            {/* Pass the potentially filtered goalsData object and permissions */}
            <GoalTimeline
                circle={circle}
                permissions={permissions}
                initialGoalsData={goalsData} // Pass fetched & filtered data
                canCreateGoal={canCreateGoal} // Pass create permission
            />
            {/* <GoalsList goalsData={filteredGoalsData} circle={circle} permissions={permissions} /> */}
        </div>
    );
}
