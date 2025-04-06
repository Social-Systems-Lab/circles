"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getIssuesAction } from "@/app/circles/[handle]/issues/actions"; // Use issues action
import { redirect } from "next/navigation";
import { Circle, IssueDisplay } from "@/models/models"; // Use IssueDisplay
import IssuesList from "./issues-list";

type PageProps = {
    circle: Circle;
};

export default async function IssuesModule({ circle }: PageProps) {
    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    // Check if user has permission to view issues
    const canViewIssues = await isAuthorized(userDid, circle._id as string, features.issues.view);
    if (!canViewIssues) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to view issues in this circle.</p>
            </div>
        );
    }

    // Get issues for this circle
    const issues: IssueDisplay[] = await getIssuesAction(circle.handle as string);

    // Perform permission checks for different actions within the issues module
    const canModerateIssue = await isAuthorized(userDid, circle._id as string, features.issues.moderate);
    const canReviewIssue = await isAuthorized(userDid, circle._id as string, features.issues.review);
    const canAssignIssue = await isAuthorized(userDid, circle._id as string, features.issues.assign);
    const canResolveIssue = await isAuthorized(userDid, circle._id as string, features.issues.resolve);
    const canCommentOnIssue = await isAuthorized(userDid, circle._id as string, features.issues.comment);

    // Filter issues based on permissions (basic filtering, more in IssuesList)
    // Example: Hide 'review' stage issues if user cannot review/moderate
    const filteredIssues = issues.filter((issue) => {
        if (issue.author.did === userDid) return true;

        if (issue.stage === "review" && !(canReviewIssue || canModerateIssue)) {
            return false; // Hide review items if user lacks permission
        }
        // Add other permission-based filtering if needed (e.g., based on issue.userGroups)
        // Visibility based on issue.userGroups should ideally be handled in the data fetching (getIssuesByCircleId)
        return true;
    });

    // Pass necessary permissions down to the list component
    const permissions = {
        canModerate: canModerateIssue,
        canReview: canReviewIssue,
        canAssign: canAssignIssue,
        canResolve: canResolveIssue,
        canComment: canCommentOnIssue,
    };

    return (
        <div className="flex w-full flex-col">
            {/* Render IssuesList component (placeholder) */}
            <IssuesList issues={filteredIssues} circle={circle} permissions={permissions} />
        </div>
    );
}
