import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCapturedEmailInboxPageData } from "@/lib/email/captured-emails-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
    title: "Captured emails | Kamooni staging",
    robots: { index: false, follow: false, nocache: true },
};

export default async function CapturedEmailsPage() {
    noStore();
    const data = await loadCapturedEmailInboxPageData();
    if (data.status === "not_found") notFound();
    const emails = data.emails;

    return (
        <main className="container mx-auto max-w-4xl p-4">
            <h1 className="text-2xl font-bold">Captured staging emails</h1>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">
                These links grant account access. Use them only for staging tests. Captures expire automatically.
            </p>
            {emails.length === 0 ? (
                <p className="text-sm text-muted-foreground">No captured emails are available.</p>
            ) : (
                <div className="space-y-4">
                    {emails.map((email) => (
                        <Card key={email.id}>
                            <CardHeader>
                                <CardTitle className="text-base">{email.type}</CardTitle>
                                <CardDescription>
                                    To {email.to} · {new Date(email.createdAt).toLocaleString()}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                {email.displayName ? <p>Account: {email.displayName}</p> : null}
                                {email.actionUrl ? (
                                    <a
                                        className="inline-block break-all font-medium text-blue-700 underline"
                                        href={email.actionUrl}
                                        rel="noreferrer"
                                    >
                                        Open staging action link
                                    </a>
                                ) : (
                                    <p className="text-muted-foreground">No account action link.</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Expires {new Date(email.expiresAt).toLocaleString()}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </main>
    );
}
