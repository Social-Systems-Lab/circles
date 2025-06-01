"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getProposalsAction } from "@/app/circles/[handle]/proposals/actions";
import ProposalsList from "./proposals-list";
import { redirect } from "next/navigation";
import { Circle } from "@/models/models";

type PageProps = {
    circle: Circle;
};

export default async function ProposalsModule({ circle }: PageProps) {
    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    // Check if user has permission to view proposals
    const canViewProposals = await isAuthorized(userDid, circle._id as string, features.proposals.view);
    if (!canViewProposals) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to view proposals in this circle.</p>
            </div>
        );
    }

    // Get proposals for this circle
    const proposals = await getProposalsAction(circle.handle as string);

    const canModerateProposal = await isAuthorized(userDid, circle._id as string, features.proposals.moderate);
    const canReviewProposal = await isAuthorized(userDid, circle._id as string, features.proposals.review);
    const canVoteProposal = await isAuthorized(userDid, circle._id as string, features.proposals.vote);
    const canResolveProposal = await isAuthorized(userDid, circle._id as string, features.proposals.resolve);

    // remove all draft proposals from the list that doesn't belong to the current user
    const filteredProposals = proposals.filter((proposal) => {
        // remove all draft proposals that don't belong to the current user
        if (proposal.stage === "draft" && proposal.author.did !== userDid) {
            return false;
        }

        // remove all proposals that are rejected that don't belong to the current user
        // Updated to check new 'rejected' stage
        if (
            proposal.stage === "rejected" && // Check new 'rejected' stage
            // proposal.outcome === "rejected" is implicit with the 'rejected' stage
            proposal.resolvedAtStage !== "voting" && // This condition might need review based on new flow
            proposal.author.did !== userDid
        ) {
            return false;
        }

        // remove all proposals that user doesn't have permission to view
        if (proposal.stage === "review" && !(canReviewProposal || canModerateProposal)) {
            return false;
        }
        if (proposal.stage === "voting" && !(canVoteProposal || canModerateProposal)) {
            return false;
        }
        // This condition for 'resolved' needs to be updated or re-evaluated
        // For 'implemented' or 'rejected' stages, visibility might be different.
        // For now, let's assume if it's 'implemented' or 'rejected' and passed previous checks, it's viewable.
        // The original logic for "resolved" stage and "resolvedAtStage" needs careful mapping to the new stages.
        // If a proposal is 'rejected' (new stage), the previous check for proposal.stage === "rejected" handles it.
        // If a proposal is 'implemented', it's generally viewable.
        // The condition `proposal.resolvedAtStage !== "voting" && !canResolveProposal`
        // was for the old 'resolved' stage. We might simplify this for now.
        // A more robust permission check might be needed per new stage if visibility rules are complex.
        if (
            (proposal.stage === "implemented" || proposal.stage === "rejected") &&
            proposal.resolvedAtStage !== "voting" &&
            !canResolveProposal &&
            !canModerateProposal &&
            proposal.author.did !== userDid
        ) {
            // This is a placeholder to be more restrictive, similar to old logic for non-voting resolved items.
            // This specific complex condition might be better handled by ensuring `getProposalsAction`
            // or `getProposalsByCircleId` already filters based on user-specific visibility for terminal states.
            // For now, this attempts to mirror the old restriction.
            return false;
        }

        return true;
    });

    return (
        <div className="flex w-full flex-col">
            <ProposalsList proposals={filteredProposals} circle={circle} />
        </div>
    );
}
