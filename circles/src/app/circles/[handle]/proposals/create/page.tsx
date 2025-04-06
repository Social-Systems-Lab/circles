import { getCircleByHandle } from "@/lib/data/circle";
import { ProposalForm } from "@/components/modules/proposals/proposal-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";
// No longer need createProposalAction import here
import { Media } from "@/models/models"; // Import Media type

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function CreateProposalPage(props: PageProps) {
    const params = await props.params;
    const circleHandle = params.handle;

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

    // Check if user has permission to create proposals
    const canCreateProposals = await isAuthorized(userDid, circle._id as string, features.proposals.create);
    if (!canCreateProposals) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to create proposals in this circle.</p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/proposals`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Proposals
                    </Link>
                </Button>
            </div>
        );
    }

    // Remove the handleSubmit wrapper

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/proposals`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Proposals
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Create New Proposal</h1>
            </div>

            {/* Remove onSubmit, pass circleHandle */}
            <ProposalForm circle={circle} circleHandle={circleHandle} />
        </div>
    );
}
