"use server";

import { ModulePageProps } from "../dynamic-page";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getProposalsAction } from "@/app/circles/[handle]/proposals/actions";
import ProposalsList from "./proposals-list";
import { redirect } from "next/navigation";
import { Page } from "@/models/models";

export default async function ProposalsModule({ circle, moduleHandle, subpage, searchParams }: ModulePageProps) {
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
                <p className="text-gray-600">You don't have permission to view proposals in this circle.</p>
            </div>
        );
    }

    // Get proposals for this circle
    const proposals = await getProposalsAction(circle.handle as string);

    // Create a synthetic page object for the proposals list
    const page: Page = {
        name: "Proposals",
        handle: "proposals",
        description: "Proposals page",
        module: "proposals",
    };

    return (
        <div className="flex h-full w-full flex-col">
            <ProposalsList proposals={proposals} circle={circle} page={page} />
        </div>
    );
}
