import { getCircleByHandle } from "@/lib/data/circle";
import { IssueForm } from "@/components/modules/issues/issue-form"; // Import IssueForm
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation"; // Import notFound
import { getUserPrivate } from "@/lib/data/user";
import { CreatableItemDetail, creatableItemsList } from "@/components/global-create/global-create-dialog-content";

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function CreateIssuePage(props: PageProps) {
    const params = await props.params;
    const circleHandle = params.handle;

    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    // Get the full user object
    const user = await getUserPrivate(userDid!); // userDid is guaranteed to be a string here
    if (!user) {
        console.error("CreateIssuePage: User not found for authenticated DID.");
        redirect("/login");
    }

    // Get the circle
    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound(); // Use notFound if circle doesn't exist
    }

    // Check if user has permission to create issues
    const canCreateIssues = await isAuthorized(userDid, circle._id as string, features.issues.create);
    if (!canCreateIssues) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&amp;apos;t have permission to create issues in this circle.</p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/issues`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Issues
                    </Link>
                </Button>
            </div>
        );
    }

    // Get the itemDetail for "issue"
    const issueItemDetail = creatableItemsList.find((item) => item.key === "issue");
    if (!issueItemDetail) {
        console.error("CreateIssuePage: 'issue' itemDetail not found in creatableItemsList.");
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Configuration Error</h2>
                <p className="text-gray-600">Could not initialize the issue creation form.</p>
            </div>
        );
    }

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/issues`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Issues
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Submit New Issue</h1>
            </div>

            {/* Render IssueForm, passing circle, user and itemDetail */}
            <IssueForm circle={circle} user={user} itemDetail={issueItemDetail} />
        </div>
    );
}
