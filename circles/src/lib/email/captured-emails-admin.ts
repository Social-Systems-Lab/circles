import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { requireCaptureConfiguration } from "./capture-config";
import { listCapturedEmails, type CapturedEmailDocument } from "./captured-emails";

export type CapturedEmailView = {
    id: string;
    to: string;
    type: string;
    displayName?: string;
    actionUrl?: string;
    createdAt: string;
    expiresAt: string;
};

type AdminInboxDependencies = {
    authorize: () => Promise<string>;
    list: () => Promise<CapturedEmailDocument[]>;
};

const defaultDependencies: AdminInboxDependencies = {
    authorize: requireSuperAdmin,
    list: listCapturedEmails,
};

export async function loadCapturedEmailInbox(
    dependencies: AdminInboxDependencies = defaultDependencies,
): Promise<CapturedEmailView[]> {
    requireCaptureConfiguration();
    await dependencies.authorize();
    const emails = await dependencies.list();
    return emails.map((email) => ({
        id: String(email._id ?? `${email.createdAt.toISOString()}:${email.to}`),
        to: email.to,
        type: email.templateAlias,
        displayName: email.displayName,
        actionUrl: email.actionUrl,
        createdAt: email.createdAt.toISOString(),
        expiresAt: email.expiresAt.toISOString(),
    }));
}

export type CapturedEmailInboxPageData = { status: "ok"; emails: CapturedEmailView[] } | { status: "not_found" };

export async function loadCapturedEmailInboxPageData(
    load: () => Promise<CapturedEmailView[]> = loadCapturedEmailInbox,
): Promise<CapturedEmailInboxPageData> {
    try {
        return { status: "ok", emails: await load() };
    } catch {
        return { status: "not_found" };
    }
}
