import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { FundingAskDisplay } from "@/models/models";
import {
    FundingProxyBadge,
    FundingStatusPill,
    FundingTrustBadge,
    formatFundingAmount,
} from "./funding-shared";

type FundingCardProps = {
    ask: FundingAskDisplay;
    circleHandle: string;
    compact?: boolean;
};

export function FundingCard({ ask, circleHandle, compact = false }: FundingCardProps) {
    const href = `/circles/${circleHandle}/funding/${ask._id}`;

    return (
        <div
            className={`overflow-hidden rounded-[15px] border border-slate-200 bg-white ${
                compact ? "p-3" : "shadow-sm"
            }`}
        >
            <div className={compact ? "flex gap-3" : "flex h-full flex-col"}>
                {ask.coverImage?.url ? (
                    <div
                        className={`relative overflow-hidden rounded-xl bg-slate-100 ${
                            compact ? "h-20 w-20 flex-shrink-0" : "aspect-[16/9] w-full"
                        }`}
                    >
                        <Image
                            src={ask.coverImage.url}
                            alt={ask.title}
                            fill
                            className="object-cover"
                            sizes={compact ? "80px" : "(max-width: 768px) 100vw, 720px"}
                        />
                    </div>
                ) : null}

                <div className={compact ? "min-w-0 flex-1" : "flex h-full flex-col p-4"}>
                    <div className="flex flex-wrap items-center gap-2">
                        <FundingStatusPill status={ask.status} />
                        <FundingTrustBadge trustBadgeType={ask.trustBadgeType} />
                        {ask.isProxy && <FundingProxyBadge />}
                    </div>

                    <div className={compact ? "mt-2" : "mt-3"}>
                        <div className="text-lg font-semibold text-slate-900">{ask.title}</div>
                        <div className="mt-1 text-sm font-medium text-slate-700">
                            {formatFundingAmount(ask.amount, ask.currency)}
                        </div>
                        <p className="mt-2 line-clamp-3 text-sm text-slate-600">{ask.shortStory}</p>
                    </div>

                    <div className={compact ? "mt-3" : "mt-4 flex items-center justify-between gap-3"}>
                        {!compact && ask.creator?.handle ? (
                            <div className="text-xs text-slate-500">Created by @{ask.creator.handle}</div>
                        ) : (
                            <div />
                        )}
                        <Button asChild variant={compact ? "ghost" : "outline"} size="sm" className="shrink-0">
                            <Link href={href}>View ask</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
