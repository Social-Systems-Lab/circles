import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { isEmailCaptureOn, EMAIL_CAPTURE_ALLOWED_HOSTS } from "./capture-mode";
import { listCapturedEmails } from "./captured-emails";

export type CapturedEmailView = {
    id: string;
    to: string;
    templateAlias: string;
    createdAt: string;
    links: string[];
    modelJson: string;
};

export type CapturedEmailsPageData = { status: "not_found" } | { status: "ok"; emails: CapturedEmailView[] };

const isApprovedCaptureUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        return (
            (url.protocol === "https:" || url.protocol === "http:") &&
            EMAIL_CAPTURE_ALLOWED_HOSTS.includes(
                url.hostname.toLowerCase() as (typeof EMAIL_CAPTURE_ALLOWED_HOSTS)[number],
            )
        );
    } catch {
        return false;
    }
};

export const linksInModel = (model: Record<string, unknown>): string[] => {
    const found: string[] = [];
    const visit = (value: unknown) => {
        if (typeof value === "string") {
            if (isApprovedCaptureUrl(value) && !found.includes(value)) found.push(value);
        } else if (Array.isArray(value)) {
            value.forEach(visit);
        } else if (value && typeof value === "object") {
            Object.values(value).forEach(visit);
        }
    };
    visit(model.action_url);
    visit(model);
    return found;
};

export const loadCapturedEmailsPage = async (): Promise<CapturedEmailsPageData> => {
    if (!isEmailCaptureOn()) return { status: "not_found" };
    try {
        await requireSuperAdmin();
    } catch {
        return { status: "not_found" };
    }
    const docs = await listCapturedEmails();
    return {
        status: "ok",
        emails: docs.map((doc) => ({
            id: String(doc._id),
            to: doc.to,
            templateAlias: doc.templateAlias,
            createdAt: doc.createdAt.toISOString(),
            links: linksInModel(doc.templateModel),
            modelJson: JSON.stringify(doc.templateModel, null, 2),
        })),
    };
};
