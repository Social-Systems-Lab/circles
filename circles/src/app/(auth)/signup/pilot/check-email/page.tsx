import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PageProps = {
    searchParams: Promise<{
        email?: string;
        handle?: string;
        redirectTo?: string;
        devVerificationToken?: string;
        devVerificationUrl?: string;
    }>;
};

export default async function PilotCheckEmailPage(props: PageProps) {
    const searchParams = await props.searchParams;
    const handle = searchParams.handle?.trim();
    const redirectTo = searchParams.redirectTo?.trim();
    const continueUrl = handle ? `/circles/${handle}` : redirectTo || "/";
    const devVerificationToken =
        process.env.NODE_ENV !== "production" ? searchParams.devVerificationToken?.trim() || null : null;
    const devVerificationHref = devVerificationToken ? `/verify-email?token=${encodeURIComponent(devVerificationToken)}` : null;

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#f7fbff] px-4 py-10">
            <Card className="w-full max-w-xl border-[#d8e7f3] shadow-sm">
                <CardHeader className="space-y-2">
                    <CardTitle className="text-3xl">Verify your email</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        We&apos;ve sent an email verification link to your address. Please verify your email so we know
                        we can reach you.
                    </p>
                    <p className="text-sm text-muted-foreground">
                        This does not verify your Kamooni profile yet. You can complete your profile and request member
                        verification later.
                    </p>
                    {searchParams.email ? (
                        <p className="text-sm font-medium text-slate-700">{searchParams.email}</p>
                    ) : null}
                </CardHeader>
                <CardContent className="space-y-5">
                    {devVerificationHref ? (
                        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                            <div className="font-medium">Development helper</div>
                            <p className="mt-1 text-sky-900">
                                Local development only: use this email verification link for testing.
                            </p>
                            <div className="mt-3">
                                <Button asChild>
                                    <Link href={devVerificationHref}>Open email verification link</Link>
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                        <Button asChild>
                            <Link href={continueUrl}>Continue to my profile</Link>
                        </Button>
                        <Button asChild variant="outline">
                            <Link href="/login">Go to login</Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
