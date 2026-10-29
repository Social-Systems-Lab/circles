import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

type PageProps = {
    searchParams: Promise<{
        email?: string;
        handle?: string;
        delivery?: string;
    }>;
};

export default async function PilotCheckEmailPage(props: PageProps) {
    const searchParams = await props.searchParams;
    const deliveryFailed = searchParams.delivery === "failed";
    const retryHref = searchParams.handle
        ? `/circles/${encodeURIComponent(searchParams.handle)}/settings/subscription#email-verification`
        : "/circles";

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#f7f2ea] px-4 py-10">
            <Card className="w-full max-w-xl border-[#e3d5c2] bg-[#faf6ef] shadow-sm">
                <CardHeader className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#e8720c]">
                        Kamooni Pilot Signup
                    </p>
                    <CardTitle className="text-3xl text-[#181512]">
                        {deliveryFailed ? "Account created" : "Check your email"}
                    </CardTitle>
                    {deliveryFailed ? (
                        <p className="text-sm text-[#6b5f52]">
                            We could not send your verification link. Your account is safe; retry from account settings.
                        </p>
                    ) : (
                        <p className="text-sm text-[#6b5f52]">
                            We&apos;ve sent a verification link to your email address. Verify your email before
                            continuing so we know we can reach you and help you recover your account if needed.
                        </p>
                    )}
                    <p className="text-sm text-[#6b5f52]">
                        Once your email is verified, you&apos;ll continue to Kamooni and complete your profile.
                    </p>
                    {searchParams.email ? (
                        <p className="text-sm font-medium text-[#181512]">{searchParams.email}</p>
                    ) : null}
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="rounded-lg border border-[#e3d5c2] bg-white/70 p-4 text-sm text-[#181512]">
                        <div className="font-medium">Next step</div>
                        {deliveryFailed ? (
                            <Link className="mt-1 inline-block font-medium text-blue-700 underline" href={retryHref}>
                                Retry verification from account settings
                            </Link>
                        ) : (
                            <p className="mt-1">Open the verification link we sent to your email.</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
