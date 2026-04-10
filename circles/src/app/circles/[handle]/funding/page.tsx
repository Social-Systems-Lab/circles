import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCircleByHandle } from "@/lib/data/circle";
import { getFundingCirclePermissions, listFundingAsksByCircleId } from "@/lib/data/funding";
import { FundingListPage } from "@/components/modules/funding/funding-list-page";

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function CircleFundingPage(props: PageProps) {
    const { handle } = await props.params;
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
                <p className="text-sm text-slate-600">You need to be a member of this circle to view funding asks.</p>
            </div>
        );
    }

    const asks = await listFundingAsksByCircleId(circle, { viewerDid: userDid });
    return <FundingListPage circle={circle} asks={asks} canCreate={permissions.canCreate} />;
}
