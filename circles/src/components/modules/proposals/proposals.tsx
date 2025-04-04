"use server";

import { ModulePageProps } from "../dynamic-page";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getProposalsAction } from "@/app/circles/[handle]/proposals/actions";
import ProposalsList from "./proposals-list";
import { redirect } from "next/navigation";
import { Page } from "@/models/models";

export default async function ProposalsModule({ circle }: ModulePageProps) {
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
        if (
            proposal.stage === "resolved" &&
            proposal.outcome === "rejected" &&
            proposal.resolvedAtStage !== "voting" &&
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
        if (proposal.stage === "resolved" && proposal.resolvedAtStage !== "voting" && !canResolveProposal) {
            return false;
        }

        return true;
    });

    // Create a synthetic page object for the proposals list
    const page: Page = {
        name: "Proposals",
        handle: "proposals",
        description: "Proposals page",
        module: "proposals",
    };

    return (
        <div className="flex h-full w-full flex-col">
            <ProposalsList proposals={filteredProposals} circle={circle} page={page} />
        </div>
    );
}
