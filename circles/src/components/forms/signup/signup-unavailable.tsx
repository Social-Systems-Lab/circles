import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupBrand } from "@/components/forms/signup/signup-brand";

export function SignupUnavailable({ reason }: { reason: "paused" | "unavailable" }) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-muted/30 p-3 sm:p-6">
            <Card className="w-full max-w-md rounded-2xl">
                <CardHeader className="space-y-3">
                    <SignupBrand />
                    <CardTitle className="text-2xl">Registration temporarily unavailable</CardTitle>
                    <CardDescription>
                        {reason === "paused"
                            ? "We’re making a few improvements and can’t accept new sign-ups right now. Please check back soon."
                            : "New sign-ups can’t be started right now. Please try again shortly."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Already have an account? You can still sign in and use Kamooni normally.
                    </p>
                    <Link className="inline-flex min-h-11 items-center font-medium underline" href="/login">
                        Log in
                    </Link>
                </CardContent>
            </Card>
        </main>
    );
}
