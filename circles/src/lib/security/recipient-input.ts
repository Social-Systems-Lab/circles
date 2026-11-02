export const MAX_RECIPIENTS_PER_ACTION = 100;

export type RecipientValidation = { ok: true; recipients: string[] } | { ok: false; message: string };

export function validateRecipientInput(input: unknown): RecipientValidation {
    if (!Array.isArray(input))
        return { ok: false, message: "Recipient list is invalid. Please refresh and try again." };
    if (input.length > MAX_RECIPIENTS_PER_ACTION) {
        return {
            ok: false,
            message: `Send invitations in groups of ${MAX_RECIPIENTS_PER_ACTION} people or fewer.`,
        };
    }
    if (input.some((recipient) => typeof recipient !== "string" || recipient.length === 0 || recipient.length > 256)) {
        return { ok: false, message: "Recipient list contains an invalid member. Please refresh and try again." };
    }

    return { ok: true, recipients: Array.from(new Set(input)) };
}

export function chunkRecipientDids(recipients: string[]): string[][] {
    const chunks: string[][] = [];
    for (let offset = 0; offset < recipients.length; offset += MAX_RECIPIENTS_PER_ACTION) {
        chunks.push(recipients.slice(offset, offset + MAX_RECIPIENTS_PER_ACTION));
    }
    return chunks;
}
