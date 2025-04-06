import { getCircleByHandle } from "@/lib/data/circle";
import { getIssueAction } from "../actions"; // Use issue action
import IssueDetail from "@/components/modules/issues/issue-detail"; // Placeholder for IssueDetail component
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect, notFound } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string; issueId: string }>; // Expect issueId
};

export default async function IssueDetailPage(props: PageProps) {
    const params = await props.params;
    const circleHandle = params.handle;
    const issueId = params.issueId;

    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    // Get the circle
    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound(); // Use notFound if circle doesn't exist
    }

    // Get the issue - getIssueAction already handles basic view permissions
    const issue = await getIssueAction(circleHandle, issueId);

    // If issue is null, it means not found or user not authorized to view
    if (!issue) {
        return (
            <div className="formatted flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Issue Not Found</h2>
                <p className="text-gray-600">
                    The issue you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to view it.
                </p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/issues`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Issues
                    </Link>
                </Button>
            </div>
        );
    }

    // Fetch detailed permissions for actions within the detail view
    const permissions = {
        canModerate: await isAuthorized(userDid, circle._id as string, features.issues.moderate),
        canReview: await isAuthorized(userDid, circle._id as string, features.issues.review),
        canAssign: await isAuthorized(userDid, circle._id as string, features.issues.assign),
        canResolve: await isAuthorized(userDid, circle._id as string, features.issues.resolve),
        canComment: await isAuthorized(userDid, circle._id as string, features.issues.comment),
    };

    return (
        <div className="formatted flex w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/issues`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Issues
                    </Link>
                </Button>
            </div>

            <div className="mx-auto w-full max-w-4xl px-4">
                {/* Render IssueDetail component (placeholder) */}
                <IssueDetail issue={issue} circle={circle} permissions={permissions} currentUserDid={userDid} />
            </div>
        </div>
    );
}
