import { getCircleByHandle } from "@/lib/data/circle";
import { getProposalAction } from "../../actions"; // Remove updateProposalAction import
import { ProposalForm } from "@/components/modules/proposals/proposal-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user"; // Import getUserPrivate
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";
import { Media, UserPrivate } from "@/models/models"; // Import Media type, UserPrivate
import { creatableItemsList, CreatableItemDetail } from "@/components/global-create/global-create-dialog-content"; // Added imports

type PageProps = {
    params: Promise<{ handle: string; proposalId: string }>;
};

export default async function EditProposalPage(props: PageProps) {
    const params = await props.params;
    const circleHandle = params.handle;
    const proposalId = params.proposalId;

    // Get the current user DID and full user object
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }
    const user = await getUserPrivate(userDid);
    if (!user) {
        console.error("Failed to fetch user details for DID:", userDid);
        redirect("/login"); // Or show an error page
    }

    // Get the circle
    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Error</h2>
                <p className="text-gray-600">Could not load circle data. Please try again.</p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/proposals`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Proposals
                    </Link>
                </Button>
            </div>
        );
    }

    // Get the proposal
    const proposal = await getProposalAction(circleHandle, proposalId);
    if (!proposal) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Proposal Not Found</h2>
                <p className="text-gray-600">
                    The proposal you&apos;re trying to edit doesn&apos;t exist or has been removed.
                </p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/proposals`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Proposals
                    </Link>
                </Button>
            </div>
        );
    }

    // Check if user has permission to edit this proposal
    const isAuthor = userDid === proposal.createdBy;
    const canModerate = await isAuthorized(userDid, circle._id as string, features.proposals.moderate);
    const canEdit = isAuthor || canModerate;

    if (!canEdit) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to edit this proposal.</p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/proposals/${proposalId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Proposal
                    </Link>
                </Button>
            </div>
        );
    }

    // Remove the handleSubmit wrapper

    return (
        <div className="formatted flex w-full flex-col">
            <div className="flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/proposals/${proposalId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Proposal
                    </Link>
                </Button>
            </div>

            {/* Remove onSubmit, pass circleHandle and proposalId */}
            <ProposalForm
                user={user as UserPrivate}
                itemDetail={creatableItemsList.find((item) => item.key === "proposal") as CreatableItemDetail}
                proposal={proposal}
                proposalId={proposalId}
                // circle prop is not strictly needed by ProposalForm if user and proposal.circleId are used
                // circleHandle is also not directly used by ProposalForm if selectedCircle is set correctly
            />
        </div>
    );
}
