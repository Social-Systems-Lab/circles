import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
    FundingAsk,
    FundingAskCategory,
    FundingAskCurrency,
    FundingAskItemStatus,
    FundingAskStatus,
    FundingAskTrustBadgeType,
    FundingAskBeneficiaryType,
    FundingAskItem,
} from "@/models/models";

export const fundingCategoryLabels: Record<FundingAskCategory, string> = {
    materials: "Materials",
    transport: "Transport",
    clothing: "Clothing",
    education: "Education",
    tools: "Tools",
    household: "Household",
    health: "Health",
    other: "Other",
};

export const fundingStatusLabels: Record<FundingAskStatus, string> = {
    draft: "Draft",
    open: "Open",
    in_progress: "In Progress",
    completed: "Completed",
    closed: "Closed",
};

export const fundingTrustBadgeLabels: Record<FundingAskTrustBadgeType, string> = {
    circle_admin: "Super admin managed",
    verified_member: "Verified member ask",
    proxy_ask: "Proxy request",
    member_ask: "Member request",
};

export const fundingCurrencyOptions: Array<{ value: FundingAskCurrency; label: string }> = [
    { value: "ZAR", label: "ZAR" },
    { value: "USD", label: "USD" },
    { value: "EUR", label: "EUR" },
];

export const fundingBeneficiaryTypeLabels: Record<FundingAskBeneficiaryType, string> = {
    self: "My circle / direct need",
    person: "A person",
    family: "A family",
    community: "A community",
    group: "A group",
    project: "A project",
    other: "Other",
};

const fundingStatusClassNames: Record<FundingAskStatus, string> = {
    draft: "border-slate-200 bg-slate-100 text-slate-700",
    open: "border-emerald-200 bg-emerald-100 text-emerald-800",
    in_progress: "border-amber-200 bg-amber-100 text-amber-800",
    completed: "border-blue-200 bg-blue-100 text-blue-800",
    closed: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

const fundingTrustBadgeClassNames: Record<FundingAskTrustBadgeType, string> = {
    circle_admin: "border-transparent bg-violet-100 text-violet-800",
    verified_member: "border-transparent bg-sky-100 text-sky-800",
    proxy_ask: "border-transparent bg-rose-100 text-rose-800",
    member_ask: "border-transparent bg-slate-100 text-slate-700",
};

export const fundingCategoryOptions = Object.entries(fundingCategoryLabels).map(([value, label]) => ({
    value: value as FundingAskCategory,
    label,
}));

export const formatFundingAmount = (amount: number, currency: string) => {
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: currency.toUpperCase(),
            maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
        }).format(amount);
    } catch {
        return `${currency.toUpperCase()} ${amount.toLocaleString()}`;
    }
};

export const getFundingBeneficiarySummary = (ask: FundingAsk) => {
    if (ask.isProxy) {
        return ask.beneficiaryName ? `For ${ask.beneficiaryName}` : "Proxy request";
    }

    if (ask.beneficiaryType === "self") {
        return "Direct circle request";
    }

    return ask.beneficiaryName || "Direct beneficiary";
};

export const formatFundingItemSummary = (item: FundingAskItem) => {
    const parts = [item.quantity ? String(item.quantity) : undefined, item.unitLabel, item.title].filter(Boolean);
    return parts.join(" ");
};

export const isFundingItemOpen = (item: FundingAskItem) => item.status === "open";

export const getFundingOpenItems = (ask: FundingAsk) => (ask.items || []).filter(isFundingItemOpen);

export const getFundingOpenItemCount = (ask: FundingAsk) => getFundingOpenItems(ask).length;

export const getFundingOpenItemTotals = (ask: FundingAsk) => {
    const totals = new Map<FundingAskCurrency, number>();

    for (const item of getFundingOpenItems(ask)) {
        const current = totals.get(item.currency) ?? 0;
        totals.set(item.currency, current + item.price);
    }

    return totals;
};

export const formatFundingOpenItemTotals = (ask: FundingAsk) => {
    const entries = Array.from(getFundingOpenItemTotals(ask).entries());

    if (entries.length === 0) {
        return "No open items";
    }

    return entries.map(([currency, amount]) => formatFundingAmount(amount, currency)).join(" + ");
};

export const getFundingRequestSummaryLine = (ask: FundingAsk) => {
    const openCount = getFundingOpenItemCount(ask);
    if (openCount === 0) {
        return fundingStatusLabels[ask.status];
    }

    return `${openCount} open item${openCount === 1 ? "" : "s"} • ${formatFundingOpenItemTotals(ask)}`;
};

export const fundingItemStatusLabels: Record<FundingAskItemStatus, string> = {
    draft: "Draft",
    open: "Open",
    completed: "Completed",
    closed: "Closed",
};

export function FundingStatusPill({ status, className }: { status: FundingAskStatus; className?: string }) {
    return (
        <Badge className={cn("border font-medium", fundingStatusClassNames[status], className)}>
            {fundingStatusLabels[status]}
        </Badge>
    );
}

export function FundingTrustBadge({
    trustBadgeType,
    className,
}: {
    trustBadgeType: FundingAskTrustBadgeType;
    className?: string;
}) {
    return (
        <Badge className={cn("border font-medium", fundingTrustBadgeClassNames[trustBadgeType], className)}>
            {fundingTrustBadgeLabels[trustBadgeType]}
        </Badge>
    );
}

export function FundingProxyBadge({ className }: { className?: string }) {
    return (
        <Badge className={cn("border-transparent bg-rose-50 text-rose-700", className)}>
            Proxy
        </Badge>
    );
}
