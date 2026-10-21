import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCapturedEmailsPage } from "@/lib/email/captured-emails-admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Captured emails", robots: { index: false, follow: false } };

export default async function CapturedEmailsPage() {
    const data = await loadCapturedEmailsPage();
    if (data.status === "not_found") notFound();

    return (
        <div className="container mx-auto max-w-4xl p-4">
            <h1 className="mb-1 text-2xl font-bold">Captured emails</h1>
            <p className="mb-6 text-sm text-muted-foreground">
                Staging email capture is on. Nothing is delivered. Entries expire after approximately 24 hours. Links
                may authenticate an account, so treat them like passwords.
            </p>
            {data.emails.length === 0 ? (
                <p className="text-sm text-muted-foreground">No emails captured in the last 24 hours.</p>
            ) : (
                <ul className="space-y-4">
                    {data.emails.map((email) => (
                        <li key={email.id} className="rounded-md border p-4 text-sm">
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                                <span className="font-mono text-xs text-muted-foreground">{email.createdAt}</span>
                                <span className="font-semibold">{email.templateAlias}</span>
                                <span>to {email.to}</span>
                            </div>
                            {email.links.length > 0 ? (
                                <ul className="mt-2 space-y-1">
                                    {email.links.map((link) => (
                                        <li key={link} className="break-all">
                                            <a href={link} className="text-blue-700 underline" rel="noreferrer">
                                                {link}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-muted-foreground">
                                    Template model
                                </summary>
                                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                                    {email.modelJson}
                                </pre>
                            </details>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
