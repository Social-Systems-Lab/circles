"use client";

import React from "react";
import QRCode from "react-qr-code";
import { BadgeCheck, Copy, ExternalLink, QrCode, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CircleMembershipCredentialCardData } from "@/lib/vibe-id/membership-credentials";

type Props = {
    credential: CircleMembershipCredentialCardData;
};

export default function MembershipCredentialCard({ credential }: Props) {
    const [isQrVisible, setIsQrVisible] = React.useState(false);
    const [copyLabel, setCopyLabel] = React.useState("Copy credential");
    const expiryLabel = credential.expiresAt ? new Date(credential.expiresAt).toLocaleDateString() : "No expiry";

    const copyCredential = async () => {
        await navigator.clipboard.writeText(credential.deepLinkUrl);
        setCopyLabel("Copied");
        window.setTimeout(() => setCopyLabel("Copy credential"), 1600);
    };

    return (
        <section className="flex flex-col gap-4 rounded-[15px] bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <WalletCards className="h-4 w-4" />
                        VibeID credential
                    </div>
                    <h2 className="m-0 text-lg font-semibold leading-tight text-foreground">Membership card</h2>
                </div>
                <Badge variant="outline" className="gap-1">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Signed
                </Badge>
            </div>

            <div className="space-y-2 text-sm">
                <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Circle</div>
                    <div className="font-medium text-foreground">{credential.circleName}</div>
                </div>
                <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Valid until</div>
                    <div className="text-foreground">{expiryLabel}</div>
                </div>
            </div>

            {isQrVisible && (
                <div className="rounded-lg border bg-white p-3">
                    <QRCode value={credential.deepLinkUrl} className="h-auto w-full" />
                </div>
            )}

            <div className="flex flex-col gap-2">
                <Button type="button" onClick={() => setIsQrVisible((visible) => !visible)}>
                    <QrCode className="mr-2 h-4 w-4" />
                    {isQrVisible ? "Hide QR code" : "Show QR code"}
                </Button>
                <Button type="button" variant="outline" asChild>
                    <a href={credential.deepLinkUrl}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open in VibeID
                    </a>
                </Button>
                <Button type="button" variant="outline" onClick={copyCredential}>
                    <Copy className="mr-2 h-4 w-4" />
                    {copyLabel}
                </Button>
            </div>
        </section>
    );
}
