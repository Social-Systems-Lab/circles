import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect, notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCircleByHandle } from "@/lib/data/circle";
import { getFundingAskById, getFundingCirclePermissions } from "@/lib/data/funding";
import { FundingForm } from "@/components/modules/funding/funding-form";

type PageProps = {
    params: Promise<{ handle: string; askId: string }>;
};

export default async function EditFundingAskPage(props: PageProps) {
    const { handle, askId } = await props.params;
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    const circle = await getCircleByHandle(handle);
    if (!circle) {
        notFound();
    }

    const permissions = await getFundingCirclePermissions(circle, userDid);
    const ask = await getFundingAskById(circle, askId, userDid);

    if (!ask) {
        return (
            <div className="formatted mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <h1 className="text-2xl font-bold">Funding ask not found</h1>
                <p className="text-sm text-slate-600">This ask does not exist or you do not have access to it.</p>
            </div>
        );
    }

    const canManageAsk = permissions.isCircleAdmin || ask.createdByDid === userDid;
    if (!canManageAsk || ask.status === "completed" || ask.status === "closed") {
        return (
            <div className="formatted mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <h1 className="text-2xl font-bold">Access denied</h1>
                <p className="text-sm text-slate-600">
                    Only the ask owner or a circle admin can edit active funding asks.
                </p>
                <Button asChild variant="outline">
                    <Link href={`/circles/${circle.handle}/funding/${ask._id}`}>Back to ask</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="formatted w-full py-6">
            <div className="mx-auto mb-4 flex w-full max-w-4xl items-center px-4">
                <Button asChild variant="ghost">
                    <Link href={`/circles/${circle.handle}/funding/${ask._id}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to ask
                    </Link>
                </Button>
            </div>
            <FundingForm circle={circle} ask={ask} />
        </div>
    );
}
