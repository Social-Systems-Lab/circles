import { redirect, notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getCircleByHandle } from "@/lib/data/circle";
import { features } from "@/lib/data/constants";
import { listPeerifyPledgesForArtist, type PeerifyPledgeRecord } from "@/lib/data/peerify-pledges";
import { isPeerifyManagedIdentity, PEERIFY_PLEDGE_HELP_OPTIONS } from "@/lib/peerify/artist-profile";

type PageProps = {
    params: Promise<{ handle: string }>;
};

const parseTicketAmount = (value: string): number => {
    const normalized = value.replace(/[^0-9.]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (date: Date): string =>
    new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(date));

const countBy = (items: string[]): Array<{ label: string; count: number }> => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
        const label = item.trim();
        if (!label) {
            return;
        }
        counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    return Array.from(counts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
    <Card>
        <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-semibold text-[#231f1a]">{value}</div>
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
    const offeredHelpCount = pledges.filter((pledge) => pledge.helpOptions.length > 0).length;
    const helpCounts = PEERIFY_PLEDGE_HELP_OPTIONS.map((option) => ({
        label: option,
        count: pledges.filter((pledge) => pledge.helpOptions.includes(option)).length,
    })).filter((item) => item.count > 0);

    return (
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
            <div>
                <p className="text-sm font-medium text-muted-foreground">Peerify demand map</p>
                <h1 className="mt-1 text-3xl font-semibold text-[#231f1a]">Pledges for {circle.name}</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Structured pledge interest from fans and supporters. These are non-binding signals, not ticket
                    purchases or confirmed bookings.
                </p>
            </div>

            <section className="grid gap-4 md:grid-cols-4">
                <StatCard label="Total pledges" value={pledges.length} />
                <StatCard label="Estimated ticket value" value={estimatedTicketValue ? estimatedTicketValue : "-"} />
                <StatCard label="Cities / locations" value={locationBreakdown.length} />
                <StatCard label="People offering help" value={offeredHelpCount} />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
                <BreakdownCard title="Pledges by location" items={locationBreakdown} emptyLabel="No locations yet." />
                <BreakdownCard title="Help offers" items={helpCounts} emptyLabel="No help offers yet." />
            </section>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Pledge list</CardTitle>
                </CardHeader>
                <CardContent>
                    {pledges.length > 0 ? (
                        <PledgeTable pledges={pledges} />
                    ) : (
                        <p className="text-sm text-muted-foreground">No pledges yet.</p>
                    )}
                </CardContent>
            </Card>
        </main>
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
        <Card>
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
                        <TableCell>{pledge.fanLocation || "-"}</TableCell>
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
