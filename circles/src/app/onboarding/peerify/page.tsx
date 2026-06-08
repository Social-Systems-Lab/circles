import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Intent = "fan" | "artist" | "host";

type PageProps = {
    searchParams: Promise<{
        intent?: string;
    }>;
};

const normalizeIntent = (value?: string): Intent | null =>
    value === "fan" || value === "artist" || value === "host" ? value : null;

const INTENT_COPY: Record<
    Intent,
    {
        eyebrow: string;
        title: string;
        description: string;
        ctaLabel: string;
        href: (handle: string) => string;
    }
> = {
    fan: {
        eyebrow: "For listeners",
        title: "Discover music as a fan/listener",
        description: "Start with discovery. Explore music communities, people, and activity across Peerify.",
        ctaLabel: "Continue to Explore",
        href: () => "/explore",
    },
    artist: {
        eyebrow: "For artists",
        title: "Create or claim an artist profile",
        description:
            "Phase 1 keeps this light. Start from your personal profile settings now, and dedicated artist onboarding can layer on later.",
        ctaLabel: "Open Profile Settings",
        href: (handle) => `/circles/${handle}/settings/about?peerifyIntent=artist`,
    },
    host: {
        eyebrow: "For hosts",
        title: "List a venue or host space",
        description:
            "Use your personal profile as the starting point for now. Venue and host-specific setup can be added later without another login.",
        ctaLabel: "Open Profile Settings",
        href: (handle) => `/circles/${handle}/settings/about?peerifyIntent=host`,
    },
};

export default async function PeerifyOnboardingPage(props: PageProps) {
    const searchParams = await props.searchParams;
    const selectedIntent = normalizeIntent(searchParams.intent);
    const intendedPath = selectedIntent ? `/onboarding/peerify?intent=${selectedIntent}` : "/onboarding/peerify";
    const userDid = await getAuthenticatedUserDid();

    if (!userDid) {
        console.error("Peerify onboarding redirecting to login: no authenticated user DID", { intendedPath });
        redirect(`/login?redirectTo=${encodeURIComponent(intendedPath)}`);
    }

    let user;
    try {
        user = await getUserPrivate(userDid);
    } catch (error) {
        console.error("Peerify onboarding failed to load user", error);
        redirect(`/login?redirectTo=${encodeURIComponent(intendedPath)}`);
    }

    if (!user) {
        redirect(`/login?redirectTo=${encodeURIComponent(intendedPath)}`);
    }

    const userHandle = user.handle || "";

    return (
        <div className="min-h-screen bg-[#181512] px-4 py-10 text-[#181512] sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">
                <Card className="overflow-hidden border border-[#3b342d] bg-[#f7f2ea] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                    <CardContent className="p-0">
                        <div className="border-b border-[#e5d8c7] bg-[#faf6ef] px-6 py-8 sm:px-8 sm:py-10">
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#e8720c]">
                                Peerify Onboarding
                            </p>
                            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#181512] sm:text-4xl">
                                What would you like to do first?
                            </h1>
                            <p className="mt-5 max-w-3xl text-base leading-7 text-[#6b5f52]">
                                Your login stays personal. This first choice only decides where Peerify starts you.
                                It is not a permanent account type, and you can add more roles later without creating
                                another login.
                            </p>
                        </div>

                        <div className="grid gap-4 bg-[#f7f2ea] p-6 sm:p-8 lg:grid-cols-3">
                            {(["fan", "artist", "host"] as Intent[]).map((intent) => {
                                const option = INTENT_COPY[intent];
                                const isSelected = selectedIntent === intent;

                                return (
                                    <section
                                        key={intent}
                                        className={`flex h-full flex-col rounded-[28px] border p-6 ${
                                            isSelected
                                                ? "border-[#e8720c] bg-[#faf6ef] shadow-[0_18px_40px_rgba(232,114,12,0.16)]"
                                                : "border-[#e5d8c7] bg-[#faf6ef]"
                                        }`}
                                    >
                                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#e8720c]">
                                            {option.eyebrow}
                                        </p>
                                        <h2 className="mt-4 text-2xl font-semibold leading-tight text-[#181512]">
                                            {option.title}
                                        </h2>
                                        <p className="mt-4 flex-1 text-sm leading-6 text-[#6b5f52]">
                                            {option.description}
                                        </p>
                                        <div className="mt-6 flex items-center gap-3">
                                            <Button
                                                asChild
                                                className="bg-[#e8720c] text-[#181512] hover:bg-[#ff8c2a]"
                                            >
                                                <Link href={option.href(userHandle)}>{option.ctaLabel}</Link>
                                            </Button>
                                            {isSelected ? (
                                                <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#6b5f52]">
                                                    Selected from signup
                                                </span>
                                            ) : null}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>

                        <div className="flex flex-col gap-4 border-t border-[#e5d8c7] bg-[#faf6ef] px-6 py-5 text-sm text-[#6b5f52] sm:flex-row sm:items-center sm:justify-between sm:px-8">
                            <p>
                                Phase 1 only chooses your starting direction. Artist, venue, and host-specific flows
                                will come next on top of the existing Circles engine.
                            </p>
                            <Button asChild variant="ghost" className="justify-start text-[#181512] hover:bg-[#f0e7db]">
                                <Link href={userHandle ? `/circles/${userHandle}/home` : "/explore"}>Skip for now</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
