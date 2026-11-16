import type { Collection } from "mongodb";

export function normalizeEmailForComparison(value: string): string {
    const email = value.trim().toLowerCase();
    const at = email.lastIndexOf("@");
    if (at < 1) return email;
    let local = email.slice(0, at);
    let domain = email.slice(at + 1);
    if (domain === "gmail.com" || domain === "googlemail.com") {
        local = local.split("+", 1)[0].replace(/\./g, "");
        domain = "gmail.com";
    }
    return `${local}@${domain}`;
}

/** Shared read-only collision lookup for pending provisioning and activation readiness. */
export async function permanentSignupAccountExists(
    accounts: Pick<Collection, "find" | "findOne">,
    normalizedEmail: string,
    requestedHandle: string,
): Promise<boolean> {
    const emailCandidates = normalizedEmail.endsWith("@gmail.com")
        ? await accounts
              .find({ email: { $regex: "@(gmail\\.com|googlemail\\.com)$", $options: "i" } })
              .project({ _id: 1, email: 1, handle: 1, did: 1 })
              .toArray()
        : await accounts
              .find({ email: normalizedEmail }, { collation: { locale: "en", strength: 2 } })
              .project({ _id: 1, email: 1, handle: 1, did: 1 })
              .toArray();
    const emailExists = emailCandidates.some(
        (candidate) => candidate.email && normalizeEmailForComparison(candidate.email) === normalizedEmail,
    );
    if (requestedHandle === "__email_only__") return emailExists;
    return emailExists || Boolean(await accounts.findOne({ handle: requestedHandle }, { projection: { _id: 1 } }));
}
