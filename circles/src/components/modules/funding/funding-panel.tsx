import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { FundingAskDisplay } from "@/models/models";
import { FundingCard } from "./funding-card";

type FundingPanelVisibility = "visible" | "sign_in" | "members_only";

type FundingPanelProps = {
    circleHandle: string;
    asks: FundingAskDisplay[];
    canCreate: boolean;
    visibility: FundingPanelVisibility;
};

export function FundingPanel({ circleHandle, asks, canCreate, visibility }: FundingPanelProps) {
    const hasVisibleAsks = visibility === "visible" && asks.length > 0;

    return (
        <div className="rounded-[15px] border-0 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Funding Needs
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                        Specific, priced needs that can be backed one ask at a time.
                    </p>
                </div>
                {visibility === "visible" && (
                    <Button asChild variant="ghost" size="sm">
                        <Link href={`/circles/${circleHandle}/funding`}>View all</Link>
                    </Button>
                )}
            </div>

            {visibility === "sign_in" ? (
                <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">Funding Needs are members-only. Sign in to view asks.</p>
                    <Button asChild size="sm">
                        <Link href="/login">Sign in</Link>
                    </Button>
                </div>
            ) : visibility === "members_only" ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Funding Needs are only visible to circle members.
                </div>
            ) : hasVisibleAsks ? (
                <div className="space-y-3">
                    {asks.map((ask) => (
                        <FundingCard key={ask._id?.toString()} ask={ask} circleHandle={circleHandle} compact />
                    ))}
                </div>
            ) : canCreate ? (
                <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">
                        No funding asks have been published yet. Start with one concrete item and one total price.
                    </p>
                    <Button asChild size="sm">
                        <Link href={`/circles/${circleHandle}/funding/new`}>Create funding ask</Link>
                    </Button>
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    No funding asks have been published yet.
                </div>
            )}
        </div>
    );
}
