type RecipientSource = { userDid?: unknown; status?: unknown };

export function resolveEventCancellationRecipientDids({
    authorDid,
    actorDid,
    eventRsvps,
    eventInvitations,
    occurrenceRsvps,
    occurrenceInvitations,
}: {
    authorDid?: unknown;
    actorDid?: unknown;
    eventRsvps: readonly RecipientSource[];
    eventInvitations: readonly RecipientSource[];
    occurrenceRsvps: readonly RecipientSource[];
    occurrenceInvitations: readonly RecipientSource[];
}): string[] {
    const recipients = new Set<string>();
    const add = (value: unknown) => {
        if (typeof value === "string" && value.length > 0 && value !== actorDid) recipients.add(value);
    };

    add(authorDid);
    for (const rsvp of eventRsvps) {
        if (["going", "interested", "waitlist"].includes(String(rsvp.status))) add(rsvp.userDid);
    }
    for (const invitation of eventInvitations) {
        if (String(invitation.status) !== "declined") add(invitation.userDid);
    }
    for (const rsvp of occurrenceRsvps) {
        if (["going", "interested"].includes(String(rsvp.status))) add(rsvp.userDid);
    }
    for (const invitation of occurrenceInvitations) add(invitation.userDid);

    return Array.from(recipients);
}
