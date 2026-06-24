import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PageProps = {
    searchParams: Promise<{
        email?: string;
        handle?: string;
        redirectTo?: string;
    }>;
};

export default async function PilotCheckEmailPage(props: PageProps) {
    const searchParams = await props.searchParams;
    const handle = searchParams.handle?.trim();
    const redirectTo = searchParams.redirectTo?.trim();
    const continueUrl = redirectTo
        ? redirectTo
        : handle
          ? `/circles/${handle}/home`
          : "/";

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#f7f2ea] px-4 py-10">
            <Card className="w-full max-w-xl border-[#e3d5c2] bg-[#faf6ef] shadow-sm">
                <CardHeader className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#e8720c]">Kamooni Pilot Signup</p>
                    <CardTitle className="text-3xl text-[#181512]">Check your email</CardTitle>
                    <p className="text-sm text-[#6b5f52]">
                        We&apos;ve sent a verification link to your email address. Verify your email before continuing
                        with profile setup so we know we can reach you.
                    </p>
                    <p className="text-sm text-[#6b5f52]">
                        This step only confirms your email address. After that, you can continue into Kamooni and choose what
                        you want to do first.
                    </p>
                    {searchParams.email ? <p className="text-sm font-medium text-[#181512]">{searchParams.email}</p> : null}
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="rounded-lg border border-[#e3d5c2] bg-white/70 p-4 text-sm text-[#181512]">
                        <div className="font-medium">Next step</div>
                        <p className="mt-1">Open the verification link we sent to your email.</p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button asChild variant="outline">
                            <Link href="/login">Go to login</Link>
                        </Button>
                    </div>

                    <p className="text-sm text-[#6b5f52]">
                        Having trouble? You can{" "}
                        <Link href={continueUrl} className="underline hover:text-[#181512]">
                            continue for now
                        </Link>
                        , but some account steps may require email verification.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
