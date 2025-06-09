import { getCircleByHandle } from "@/lib/data/circle";
import { getIssueById } from "@/lib/data/issue";
import { IssueForm } from "@/components/modules/issues/issue-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { UserPrivate } from "@/models/models"; // Added import
import { getUserPrivate } from "@/lib/data/user"; // Corrected function name
import { CreatableItemDetail } from "@/components/global-create/global-create-dialog-content"; // Added import

type PageProps = {
    params: Promise<{ handle: string; issueId: string }>;
};

export default async function EditIssuePage(props: PageProps) {
    const params = await props.params;
    const circleHandle = params.handle;
    const issueId = params.issueId;

    // Validate issueId format if necessary (e.g., check if it's a valid ObjectId)
    if (!ObjectId.isValid(issueId)) {
        notFound();
    }

    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    // Fetch user profile
    const userProfile = await getUserPrivate(userDid); // Corrected function call
    if (!userProfile) {
        // Handle case where user profile is not found, e.g., redirect or show error
        console.error("User profile not found for DID:", userDid);
        notFound(); // Or redirect to an error page
    }

    // Get the circle
    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound();
    }

    // Get the issue
    const issue = await getIssueById(issueId);
    if (!issue) {
        notFound();
    }

    // Check if user has permission to edit issues
    const canEditIssues = await isAuthorized(userDid, circle._id as string, features.issues.update);
    if (!canEditIssues) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to edit issues in this circle.</p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/issues/${issueId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Issue
                    </Link>
                </Button>
            </div>
        );
    }

    // Define itemDetail for IssueForm
    const itemDetailForIssueForm: CreatableItemDetail = {
        key: "issue",
        title: "Issue", // IssueForm will display "Edit Issue" based on `isEditing`
        description: "Edit an existing issue.", // Placeholder description
        moduleHandle: "issues", // From creatableItemsList definition
        createFeatureHandle: "create", // From creatableItemsList definition
        // icon: AlertTriangle, // Optional: could import AlertTriangle from lucide-react
    };

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/issues/${issueId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Issue
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Edit Issue</h1>
            </div>

            {/* Render IssueForm, passing circle, circleHandle, and the existing issue */}
            <IssueForm
                user={userProfile}
                itemDetail={itemDetailForIssueForm}
                circle={circle}
                issue={issue}
                issueId={issue._id}
            />
        </div>
    );
}
