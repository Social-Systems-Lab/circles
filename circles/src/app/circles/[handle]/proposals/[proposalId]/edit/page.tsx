import { getCircleByHandle } from "@/lib/data/circle";
import { getProposalAction, updateProposalAction } from "../../actions";
import { ProposalForm } from "@/components/modules/proposals/proposal-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";

type PageProps = {
    params: { handle: string; proposalId: string };
};

export default async function EditProposalPage({ params }: PageProps) {
    const circleHandle = params.handle;
    const proposalId = params.proposalId;

    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
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
                <p className="text-gray-600">The proposal you're trying to edit doesn't exist or has been removed.</p>
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
                <p className="text-gray-600">You don't have permission to edit this proposal.</p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/proposals/${proposalId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Proposal
                    </Link>
                </Button>
            </div>
        );
    }

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

            <ProposalForm
                circle={circle}
                proposal={proposal}
                onSubmit={updateProposalAction.bind(null, circleHandle, proposalId)}
            />
        </div>
    );
}
