import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect, notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCircleByHandle } from "@/lib/data/circle";
import { getFundingAskById, getFundingCirclePermissions } from "@/lib/data/funding";
import { FundingDetail } from "@/components/modules/funding/funding-detail";

type PageProps = {
    params: Promise<{ handle: string; askId: string }>;
};

export default async function FundingAskDetailPage(props: PageProps) {
    const { handle, askId } = await props.params;
    const circle = await getCircleByHandle(handle);
    if (!circle) {
        notFound();
    }
    if (!circle.enabledModules?.includes("funding")) {
        notFound();
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    const permissions = await getFundingCirclePermissions(circle, userDid);
    if (!permissions.canView) {
        return (
            <div className="formatted mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <h1 className="text-2xl font-bold">Funding Needs are members-only</h1>
                <p className="text-sm text-slate-600">You need to be a member of this circle to view this ask.</p>
            </div>
        );
    }

    const ask = await getFundingAskById(circle, askId, userDid);
    if (!ask) {
        return (
            <div className="formatted mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <h1 className="text-2xl font-bold">Funding ask not found</h1>
                <p className="text-sm text-slate-600">This ask does not exist or you do not have access to it.</p>
                <Button asChild variant="outline">
                    <Link href={`/circles/${circle.handle}/funding`}>Back to Funding Needs</Link>
                </Button>
            </div>
        );
    }

    const canManageAsk = permissions.isCircleAdmin || ask.createdByDid === userDid;
    const canClaimAsk = permissions.canView && ask.status === "open" && ask.createdByDid !== userDid;

    return (
        <div className="formatted w-full py-6">
            <div className="mx-auto mb-4 flex w-full max-w-5xl items-center px-4">
                <Button asChild variant="ghost">
                    <Link href={`/circles/${circle.handle}/funding`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Funding Needs
                    </Link>
                </Button>
            </div>
            <FundingDetail
                circle={circle}
                ask={ask}
                canManageAsk={canManageAsk}
                canClaimAsk={canClaimAsk}
                isActiveSupporter={ask.activeSupporterDid === userDid}
            />
        </div>
    );
}
