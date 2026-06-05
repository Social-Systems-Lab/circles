import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect, notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCircleByHandle } from "@/lib/data/circle";
import { getFundingCirclePermissions, isFundingEnabledForCircle } from "@/lib/data/funding";
import { FundingForm } from "@/components/modules/funding/funding-form";

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function NewFundingAskPage(props: PageProps) {
    const { handle } = await props.params;
    const circle = await getCircleByHandle(handle);
    if (!circle) {
        notFound();
    }
    if (!isFundingEnabledForCircle(circle)) {
        notFound();
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    const permissions = await getFundingCirclePermissions(circle, userDid);
    if (!permissions.canCreate) {
        return (
            <div className="formatted mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <h1 className="text-2xl font-bold">Access denied</h1>
                <p className="text-sm text-slate-600">
                    Only Super Admins can create funding requests in this MVP.
                </p>
                <Button asChild variant="outline">
                    <Link href={`/circles/${circle.handle}/funding`}>Back to Funding Needs</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="formatted w-full py-6">
            <div className="mx-auto mb-4 flex w-full max-w-4xl items-center px-4">
                <Button asChild variant="ghost">
                    <Link href={`/circles/${circle.handle}/funding`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Funding Needs
                    </Link>
                </Button>
            </div>
            <FundingForm circle={circle} />
        </div>
    );
}
