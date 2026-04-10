import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
    FundingAsk,
    FundingAskCategory,
    FundingAskCurrency,
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
    circle_admin: "Circle admin ask",
    verified_member: "Verified member ask",
    proxy_ask: "Proxy ask",
    member_ask: "Member ask",
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
        return ask.beneficiaryName
            ? `${fundingCategoryLabels[ask.category]} for ${ask.beneficiaryName}`
            : "Proxy ask";
    }

    if (ask.beneficiaryType === "self") {
        return "Direct circle need";
    }

    return ask.beneficiaryName || "Direct beneficiary";
};

export const formatFundingItemSummary = (item: FundingAskItem) => {
    const parts = [item.quantity ? String(item.quantity) : undefined, item.unitLabel, item.name].filter(Boolean);
    return parts.join(" ");
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
