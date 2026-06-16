import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PublishManagedProfileButton } from "@/components/profiles/publish-managed-profile-button";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import { getCircleDefaultPath } from "@/lib/utils/circle-routes";
import { getPeerifyArtistIdentityLabel, isPeerifyManagedIdentity } from "@/lib/peerify/artist-profile";
import { Circle } from "@/models/models";

const getAvatarUrl = (circle: Circle, fallback: string) => circle.picture?.url ?? fallback;
const getStatusLabel = (status: string) => {
    if (status === "published") {
        return "Published";
    }

    if (status === "pending_verification") {
        return "Pending verification";
    }

    return "Draft";
};

export default async function ProfilesPage() {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login?redirectTo=/profiles");
    }

    const user = await getUserPrivate(userDid);
    const managedIdentities = user.memberships
        .filter((membership) => membership.userGroups?.includes("admins"))
        .map((membership) => membership.circle)
        .filter(isPeerifyManagedIdentity);

    const rows = [
        {
            circle: user,
            label: "Personal profile",
            status: user.publishStatus ?? "published",
            canPublish: false,
            avatarFallback: "/images/default-user-picture.png",
            editHref: `/circles/${user.handle}/settings/about`,
            pledgesHref: null,
        },
        ...managedIdentities.map((identity) => ({
            circle: identity,
            label: getPeerifyArtistIdentityLabel(identity),
            status: identity.publishStatus ?? "published",
            canPublish: (identity.publishStatus ?? "published") === "draft",
            avatarFallback: "/peerify/default-artist-avatar.svg",
            editHref: `/circles/${identity.handle}/settings/about`,
            pledgesHref: `/circles/${identity.handle}/settings/pledges`,
        })),
    ];

    return (
        <main className="mx-auto mt-16 flex w-full max-w-4xl flex-col gap-6 px-4 pb-12">
            <div>
                <h1 className="text-3xl font-semibold text-[#231f1a]">Profiles</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Manage your personal profile and public Peerify identities.
                </p>
            </div>

            <div className="overflow-hidden rounded-lg border bg-white">
                {rows.map((row) => (
                    <div
                        key={row.circle._id}
                        className="flex flex-col gap-4 border-b p-4 last:border-b-0 sm:flex-row sm:items-center"
                    >
                        <Link
                            href={getCircleDefaultPath(row.circle)}
                            className="flex min-w-0 flex-1 items-center gap-3"
                        >
                            <Image
                                src={getAvatarUrl(row.circle, row.avatarFallback)}
                                alt={row.circle.name ?? "Profile"}
                                width={48}
                                height={48}
                                className="h-12 w-12 rounded-full bg-white object-cover"
                            />
                            <div className="min-w-0">
                                <div className="truncate font-semibold text-[#231f1a]">{row.circle.name}</div>
                                <div className="truncate text-sm text-muted-foreground">{row.label}</div>
                            </div>
                        </Link>

                        <div className="flex items-center gap-2 sm:justify-end">
                            <Badge variant={row.status === "published" ? "secondary" : "outline"}>
                                {getStatusLabel(row.status)}
                            </Badge>
                            <Button asChild variant="outline" size="sm">
                                <Link href={getCircleDefaultPath(row.circle)}>View</Link>
                            </Button>
                            {row.pledgesHref ? (
                                <Button asChild variant="outline" size="sm">
                                    <Link href={row.pledgesHref}>Pledges</Link>
                                </Button>
                            ) : null}
                            {row.canPublish && row.circle._id ? (
                                <PublishManagedProfileButton circleId={row.circle._id} label="Publish" />
                            ) : null}
                            <Button asChild size="sm" variant={row.canPublish ? "outline" : "default"}>
                                <Link href={row.editHref}>{row.canPublish ? "Edit / publish" : "Edit"}</Link>
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}
