"use client";

import { useId, useState, useTransition } from "react";
import { Mail, Send } from "lucide-react";
import { inviteEventGuestsAction } from "@/app/circles/[handle]/events/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
    formatGuestInvitationWhen,
    guestInvitationDetails,
    guestInvitationPreviewKey,
    guestResponseLabel,
    type EventGuestInviteeRow,
    type GuestInvitationPreview,
} from "@/lib/event-guest-invitation";

export const GUEST_INVITATIONS_UPDATED = "event-guest-invitations-updated";

export function GuestInvitationForm({
    circleHandle,
    eventId,
    event,
}: {
    circleHandle: string;
    eventId: string;
    event: GuestInvitationPreview;
}) {
    const fieldId = useId();
    const { toast } = useToast();
    const [addresses, setAddresses] = useState("");
    const [pending, startTransition] = useTransition();
    const details = guestInvitationDetails(event);
    const when = formatGuestInvitationWhen(event.startAt, event.endAt, event.allDay);

    function send() {
        const recipients = addresses
            .split(/[,\n]/)
            .map((email) => email.trim())
            .filter(Boolean);
        if (!recipients.length || pending) return;
        startTransition(async () => {
            try {
                const result = await inviteEventGuestsAction(
                    circleHandle,
                    eventId,
                    recipients,
                    guestInvitationPreviewKey(event),
                );
                if (!result.success) {
                    toast({
                        title: "Could not send guest invitations",
                        description: result.message,
                        variant: "destructive",
                    });
                    return;
                }
                setAddresses("");
                const { sent, unconfirmed, alreadyInvited } = result;
                const savedMessage = unconfirmed > 1
                    ? `${unconfirmed} invitations saved — email delivery unconfirmed`
                    : "Invitation saved — email delivery unconfirmed";
                toast({
                    title:
                        sent > 0
                            ? `${sent} guest invitation${sent === 1 ? "" : "s"} sent`
                            : unconfirmed > 0
                              ? savedMessage
                              : "Guests already invited",
                    description: [
                        sent > 0 && unconfirmed > 0 && savedMessage,
                        alreadyInvited > 0 && `${alreadyInvited} already invited`,
                    ]
                        .filter(Boolean)
                        .join(" · ") || undefined,
                });
            } catch {
                toast({ title: "Could not send guest invitations", variant: "destructive" });
            } finally {
                window.dispatchEvent(new window.Event(GUEST_INVITATIONS_UPDATED));
            }
        });
    }

    return (
        <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
                <Mail aria-hidden="true" className="mr-2 inline-block h-4 w-4 align-text-bottom" />
                Invite guests by email
            </summary>
            <div className="mt-3 space-y-2">
                <label htmlFor={fieldId} className="font-medium">
                    Guest email addresses
                </label>
                <Textarea
                    id={fieldId}
                    value={addresses}
                    onChange={(event) => setAddresses(event.target.value)}
                    disabled={pending}
                    rows={2}
                    maxLength={2560}
                    aria-describedby={`${fieldId}-hint`}
                />
                <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
                    Enter up to 10 addresses, separated by commas or new lines.
                </p>
                <div className="space-y-1 break-words rounded-md bg-muted/40 p-2 text-xs">
                    <p className="font-medium">Guests will receive these event details and a private RSVP link</p>
                    <p>{details.title}</p>
                    <p>{when}</p>
                    <p>
                        {details.location}
                        {details.meetingUrl && ` · ${details.meetingUrl}`}
                    </p>
                    {details.description && <p>{details.description}</p>}
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || !addresses.trim()}
                    onClick={send}
                >
                    <Send aria-hidden="true" className="mr-2 h-4 w-4" />
                    {pending ? "Sending…" : "Send guest invitations"}
                </Button>
            </div>
        </details>
    );
}

export function GuestInviteeRows({ guests }: { guests: EventGuestInviteeRow[] }) {
    return guests.map((guest) => (
        <li key={guest.email} className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
            <span className="min-w-0 break-all">{guest.email}</span>
            <span className="shrink-0 text-right text-xs text-muted-foreground">
                {guestResponseLabel[guest.status]}
                {!guest.deliveryConfirmed && guest.status === "pending" && (
                    <span className="block">Delivery unconfirmed</span>
                )}
            </span>
        </li>
    ));
}
