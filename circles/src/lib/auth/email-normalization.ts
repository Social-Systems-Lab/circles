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
