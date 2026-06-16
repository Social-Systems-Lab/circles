import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getCircleByHandle } from "@/lib/data/circle";
import { features } from "@/lib/data/constants";
import { listPeerifyPledgesForArtist, type PeerifyPledgeRecord } from "@/lib/data/peerify-pledges";
import { isPeerifyManagedIdentity, PEERIFY_PLEDGE_HELP_OPTIONS } from "@/lib/peerify/artist-profile";
import { ArrowLeft, HandHeart, LockKeyhole, MapPinned, Pencil, Users } from "lucide-react";

type PageProps = {
    params: Promise<{ handle: string }>;
};

const parseTicketAmount = (value: string): number => {
    const normalized = value.replace(/[^0-9.]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatEstimatedTicketValue = (value: number): string => (value > 0 ? value.toLocaleString("en") : "-");

const getCityAreaLabel = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) {
        return "Unspecified area";
    }

    const looksAddressLike =
        /^\d+\s+\S+/.test(trimmed) ||
        /\b(street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|square|sq)\b/i.test(trimmed);
    const parts = trimmed
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

    if (
        parts.length > 1 &&
        (/^\d+\s+\S+/.test(parts[0]) ||
            /\b(street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|square|sq)\b/i.test(parts[0]))
    ) {
        return parts.slice(1).join(", ");
    }

    if (looksAddressLike) {
        return "City/area provided";
    }

    return trimmed;
};

const getLocationClusterId = (label: string): string =>
    `pledge-location-${
        label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "area"
    }`;

const formatDate = (date: Date): string =>
    new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(date));

const countBy = (items: string[]): Array<{ label: string; count: number }> => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
        const label = getCityAreaLabel(item);
        if (!label) {
            return;
        }
        counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    return Array.from(counts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

type PledgeLocationCluster = {
    label: string;
    pledgeCount: number;
    estimatedTicketValue: number;
    helpOfferCount: number;
    helpOptions: Array<{ label: string; count: number }>;
};

const buildLocationClusters = (pledges: PeerifyPledgeRecord[]): PledgeLocationCluster[] => {
    const clusters = new Map<string, PledgeLocationCluster>();

    pledges.forEach((pledge) => {
        const label = getCityAreaLabel(pledge.fanLocation);
        const existing =
            clusters.get(label) ??
            ({
                label,
                pledgeCount: 0,
                estimatedTicketValue: 0,
                helpOfferCount: 0,
                helpOptions: [],
            } satisfies PledgeLocationCluster);
        const helpCounts = new Map(existing.helpOptions.map((option) => [option.label, option.count]));

        existing.pledgeCount += 1;
        existing.estimatedTicketValue += parseTicketAmount(pledge.maximumTicketAmount);

        if (pledge.helpOptions.length > 0) {
            existing.helpOfferCount += 1;
        }

        pledge.helpOptions.forEach((option) => {
            helpCounts.set(option, (helpCounts.get(option) ?? 0) + 1);
        });

        existing.helpOptions = Array.from(helpCounts.entries())
            .map(([optionLabel, count]) => ({ label: optionLabel, count }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

        clusters.set(label, existing);
    });

    return Array.from(clusters.values()).sort(
        (a, b) =>
            b.pledgeCount - a.pledgeCount ||
            b.estimatedTicketValue - a.estimatedTicketValue ||
            a.label.localeCompare(b.label),
    );
};

const StatCard = ({ label, value, description }: { label: string; value: string | number; description: string }) => (
    <Card className="rounded-lg border-slate-200 bg-white shadow-none">
        <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
            <div className="text-2xl font-semibold text-[#231f1a]">{value}</div>
            <p className="text-xs text-slate-500">{description}</p>
        </CardContent>
    </Card>
);

export default async function PeerifyPledgesPage({ params }: PageProps) {
    const { handle } = await params;
    const circle = await getCircleByHandle(handle);

    if (!circle?._id || !isPeerifyManagedIdentity(circle)) {
        notFound();
    }

    const userDid = await getAuthenticatedUserDid();
    const canManage = await isAuthorized(userDid, circle._id, features.settings.edit_about);

    if (!canManage) {
        redirect(`/circles/${handle}/access-denied?module=pledges&redirectTo=/circles/${handle}/settings/pledges`);
    }

    const pledges = await listPeerifyPledgesForArtist(circle._id);
    const estimatedTicketValue = pledges.reduce(
        (total, pledge) => total + parseTicketAmount(pledge.maximumTicketAmount),
        0,
    );
    const locationBreakdown = countBy(pledges.map((pledge) => pledge.fanLocation));
    const locationClusters = buildLocationClusters(pledges);
    const offeredHelpCount = pledges.filter((pledge) => pledge.helpOptions.length > 0).length;
    const helpCounts = PEERIFY_PLEDGE_HELP_OPTIONS.map((option) => ({
        label: option,
        count: pledges.filter((pledge) => pledge.helpOptions.includes(option)).length,
    })).filter((item) => item.count > 0);

    return (
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="gap-1 rounded-full px-3 py-1">
                                <LockKeyhole className="h-3.5 w-3.5" />
                                Private to profile managers
                            </Badge>
                            <Badge variant="outline" className="rounded-full px-3 py-1">
                                Non-binding demand signals
                            </Badge>
                        </div>
                        <p className="mt-5 text-sm font-medium text-slate-500">Peerify artist intelligence</p>
                        <h1 className="mt-1 text-3xl font-semibold text-[#231f1a] sm:text-4xl">Pledge Dashboard</h1>
                        <p className="mt-3 max-w-2xl text-base text-slate-600">
                            See where fans want you to play, what they might pay, and who can help make a show happen.
                        </p>
                        <p className="mt-3 max-w-2xl text-sm text-slate-500">
                            Pledges are non-binding signals, not ticket purchases or confirmed bookings. Individual
                            pledge details are visible only to profile managers/admins.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Button asChild variant="outline">
                            <Link href={`/circles/${handle}/home`}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to artist profile
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href={`/circles/${handle}/settings/about`}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit artist profile
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>

            <section className="grid gap-4 md:grid-cols-4">
                <StatCard label="Total pledges" value={pledges.length} description="Fans who raised their hand" />
                <StatCard
                    label="Estimated ticket value"
                    value={formatEstimatedTicketValue(estimatedTicketValue)}
                    description="Sum of numeric max amounts"
                />
                <StatCard label="Locations" value={locationBreakdown.length} description="Distinct cities or areas" />
                <StatCard
                    label="People offering help"
                    value={offeredHelpCount}
                    description="Support beyond attending"
                />
            </section>

            {pledges.length === 0 ? (
                <Card className="rounded-lg border-dashed border-slate-300 bg-slate-50 shadow-none">
                    <CardContent className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
                        <h2 className="text-xl font-semibold text-[#231f1a]">No pledges yet</h2>
                        <p className="mt-2 max-w-xl text-sm text-slate-600">
                            No pledges yet. When fans signal interest in a local show, their responses will appear here.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <PledgeMapPreview clusters={locationClusters} />

                    <section className="grid gap-4 lg:grid-cols-2">
                        <BreakdownCard
                            title="Pledges by location"
                            items={locationBreakdown}
                            emptyLabel="No locations yet."
                        />
                        <BreakdownCard title="Help offers" items={helpCounts} emptyLabel="No help offers yet." />
                    </section>

                    <Card className="rounded-lg border-slate-200 bg-white shadow-none">
                        <CardHeader>
                            <CardTitle className="text-lg">Pledge list</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <PledgeTable pledges={pledges} />
                        </CardContent>
                    </Card>
                </>
            )}
        </main>
    );
}

function PledgeMapPreview({ clusters }: { clusters: PledgeLocationCluster[] }) {
    const topCluster = clusters[0];
    const maxPledgeCount = Math.max(...clusters.map((cluster) => cluster.pledgeCount), 1);

    return (
        <Card className="overflow-hidden rounded-lg border-slate-200 bg-white shadow-none">
            <CardHeader className="border-b border-slate-100 bg-slate-50/70">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <MapPinned className="h-5 w-5 text-[#231f1a]" />
                            <CardTitle className="text-lg">Pledge Map</CardTitle>
                        </div>
                        <p className="mt-2 max-w-2xl text-sm text-slate-600">
                            Locations are shown at city/area level. Individual pledge details are private to profile
                            managers.
                        </p>
                    </div>
                    {topCluster ? (
                        <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
                            Strongest demand: {topCluster.label}
                        </Badge>
                    ) : null}
                </div>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="relative min-h-72 overflow-hidden rounded-lg border border-slate-200 bg-[radial-gradient(circle_at_20%_20%,#e0f2fe_0,#e0f2fe_16%,transparent_17%),radial-gradient(circle_at_75%_30%,#fef3c7_0,#fef3c7_12%,transparent_13%),linear-gradient(135deg,#f8fafc,#eef2ff)] p-4">
                    <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(#cbd5e1_1px,transparent_1px),linear-gradient(90deg,#cbd5e1_1px,transparent_1px)] [background-size:36px_36px]" />
                    <div className="relative grid h-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {clusters.slice(0, 6).map((cluster, index) => {
                            const intensity = Math.max(44, Math.round((cluster.pledgeCount / maxPledgeCount) * 100));

                            return (
                                <a
                                    key={cluster.label}
                                    href={`#${getLocationClusterId(cluster.label)}`}
                                    className="group flex min-h-28 flex-col justify-between rounded-lg border border-white/80 bg-white/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-[#231f1a]/30 hover:shadow-md"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-medium uppercase text-slate-500">
                                                Cluster {index + 1}
                                            </p>
                                            <h3 className="mt-1 text-base font-semibold text-[#231f1a]">
                                                {cluster.label}
                                            </h3>
                                        </div>
                                        <span
                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#231f1a] text-sm font-semibold text-white ring-4 ring-white"
                                            style={{ opacity: intensity / 100 }}
                                        >
                                            {cluster.pledgeCount}
                                        </span>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                                        <span className="inline-flex items-center gap-1">
                                            <Users className="h-3.5 w-3.5" />
                                            {cluster.pledgeCount} pledges
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <HandHeart className="h-3.5 w-3.5" />
                                            {cluster.helpOfferCount} help offers
                                        </span>
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-3">
                    <div>
                        <h3 className="text-sm font-semibold text-[#231f1a]">Ranked demand clusters</h3>
                        <p className="mt-1 text-xs text-slate-500">Grouped from pledge location text.</p>
                    </div>
                    <div className="max-h-72 space-y-3 overflow-auto pr-1">
                        {clusters.map((cluster) => (
                            <div
                                key={cluster.label}
                                id={getLocationClusterId(cluster.label)}
                                className="rounded-lg border border-slate-200 bg-white p-3"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h4 className="font-medium text-[#231f1a]">{cluster.label}</h4>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {cluster.pledgeCount} pledge{cluster.pledgeCount === 1 ? "" : "s"} -{" "}
                                            {formatEstimatedTicketValue(cluster.estimatedTicketValue)} estimated ticket
                                            value
                                        </p>
                                    </div>
                                    <Badge variant="secondary">{cluster.helpOfferCount} help</Badge>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-1">
                                    {cluster.helpOptions.length > 0 ? (
                                        cluster.helpOptions.map((option) => (
                                            <Badge key={option.label} variant="outline">
                                                {option.label}
                                                {option.count > 1 ? ` x ${option.count}` : ""}
                                            </Badge>
                                        ))
                                    ) : (
                                        <span className="text-xs text-slate-500">No support offers yet</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function BreakdownCard({
    title,
    items,
    emptyLabel,
}: {
    title: string;
    items: Array<{ label: string; count: number }>;
    emptyLabel: string;
}) {
    return (
        <Card className="rounded-lg border-slate-200 bg-white shadow-none">
            <CardHeader>
                <CardTitle className="text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {items.length > 0 ? (
                    <div className="space-y-3">
                        {items.map((item) => (
                            <div key={item.label} className="flex items-center justify-between gap-4 text-sm">
                                <span className="font-medium text-[#231f1a]">{item.label}</span>
                                <Badge variant="secondary">{item.count}</Badge>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">{emptyLabel}</p>
                )}
            </CardContent>
        </Card>
    );
}

function PledgeTable({ pledges }: { pledges: PeerifyPledgeRecord[] }) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Pledger</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Max ticket</TableHead>
                    <TableHead>Event type</TableHead>
                    <TableHead>Help</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Date</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {pledges.map((pledge) => (
                    <TableRow key={pledge._id}>
                        <TableCell>
                            <div className="font-medium text-[#231f1a]">
                                {pledge.pledgerName || "Unknown supporter"}
                            </div>
                            {pledge.pledgerHandle ? (
                                <div className="text-xs text-muted-foreground">@{pledge.pledgerHandle}</div>
                            ) : null}
                        </TableCell>
                        <TableCell>{getCityAreaLabel(pledge.fanLocation)}</TableCell>
                        <TableCell>{pledge.maximumTicketAmount || "-"}</TableCell>
                        <TableCell>{pledge.preferredEventType || "-"}</TableCell>
                        <TableCell>
                            {pledge.helpOptions.length > 0 ? (
                                <div className="flex max-w-xs flex-wrap gap-1">
                                    {pledge.helpOptions.map((option) => (
                                        <Badge key={option} variant="outline">
                                            {option}
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                "-"
                            )}
                        </TableCell>
                        <TableCell className="max-w-xs whitespace-pre-wrap">{pledge.note || "-"}</TableCell>
                        <TableCell>{formatDate(pledge.createdAt)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
