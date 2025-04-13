import { getCircleByHandle } from "@/lib/data/circle";
import { getProposalAction, ensureShadowPostForProposalAction } from "../actions"; // Added ensureShadowPostForProposalAction
import { ProposalItem } from "@/components/modules/proposals/proposal-item";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string; proposalId: string }>;
};

export default async function ProposalDetailPage(props: PageProps) {
    const params = await props.params;
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
            <div className="formatted flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Error</h2>
                <p className="text-gray-600">Could not load circle data. Please try again.</p>
            </div>
        );
    }

    // Check if user has permission to view proposals
    const canViewProposals = await isAuthorized(userDid, circle._id as string, features.proposals.view);
    if (!canViewProposals) {
        return (
            <div className="formatted flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to view proposals in this circle.</p>
            </div>
        );
    }

    // Get the proposal
    const proposal = await getProposalAction(circleHandle, proposalId);
    if (!proposal) {
        return (
            <div className="formatted flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Proposal Not Found</h2>
                <p className="text-gray-600">
                    The proposal you&apos;re looking for doesn&apos;t exist or has been removed.
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

    // Ensure shadow post exists for comments
    if (!proposal.commentPostId) {
        console.log(`Proposal ${proposalId} missing commentPostId, attempting to ensure shadow post...`);
        const ensuredPostId = await ensureShadowPostForProposalAction(proposalId, circle._id as string);
        if (ensuredPostId) {
            proposal.commentPostId = ensuredPostId; // Update the proposal object in memory
            console.log(`Successfully ensured shadow post ${ensuredPostId} for proposal ${proposalId}`);
        } else {
            console.error(`Failed to ensure shadow post for proposal ${proposalId}`);
            // Continue rendering without comments enabled for this proposal
        }
    }

    return (
        <div className="formatted flex w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/proposals`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Proposals
                    </Link>
                </Button>
            </div>

            <div className="mx-auto w-full max-w-4xl px-4">
                <ProposalItem proposal={proposal} circle={circle} />
            </div>
        </div>
    );
}
