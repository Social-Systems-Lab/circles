import { ServerClient, TemplatedMessage } from "postmark";
import crypto from "crypto";
import { getEmailTransportConfiguration, type EmailTransportConfiguration } from "@/lib/email/capture-config";
import type { CaptureEmailInput } from "@/lib/email/captured-emails";

const POSTMARK_API_TOKEN = process.env.POSTMARK_API_TOKEN;
const POSTMARK_SENDER_EMAIL = process.env.POSTMARK_SENDER_EMAIL;
const SOCIAL_SYSTEMS_LAB_URL = "https://www.socialsystems.io/";

if (!POSTMARK_API_TOKEN) {
    console.warn("POSTMARK_API_TOKEN is not set. Email functionality will be disabled.");
}
if (!POSTMARK_SENDER_EMAIL) {
    console.warn("POSTMARK_SENDER_EMAIL is not set. Email functionality will be disabled.");
}

// Initialize Postmark client
// It's okay if token is undefined here; checks below will prevent API calls.
const client = POSTMARK_API_TOKEN ? new ServerClient(POSTMARK_API_TOKEN) : null;

export interface EmailOptions {
    to: string;
    templateAlias: string;
    templateModel: Record<string, any>;
}

type EmailDeliveryDependencies = {
    resolveTransport: () => EmailTransportConfiguration;
    capture: (email: CaptureEmailInput) => Promise<void>;
    postmark: (options: EmailOptions) => Promise<void>;
};

const getTemplateString = (templateModel: Record<string, any>, ...keys: string[]): string | undefined => {
    for (const key of keys) {
        const value = templateModel[key];
        if (typeof value === "string" && value.trim().length > 0) {
            return value;
        }
    }

    return undefined;
};

export const applyEmailTemplateDefaults = (templateModel: Record<string, any>): Record<string, any> => {
    const productUrl =
        getTemplateString(templateModel, "productUrl", "product_url") ||
        process.env.CIRCLES_URL ||
        "http://localhost:3000";
    const actionUrl = getTemplateString(templateModel, "actionUrl", "action_url");
    const actionText = getTemplateString(templateModel, "actionText", "action_text", "buttonText", "button_text");
    const introText = getTemplateString(templateModel, "introText", "intro_text");
    const bodyText = getTemplateString(templateModel, "bodyText", "body_text");
    const summaryText = getTemplateString(templateModel, "summaryText", "summary_text");
    const defaults = { ...templateModel };

    defaults.product_url = productUrl;
    defaults.product_name = "Kamooni";
    defaults.company_name = "Social Systems Lab";
    defaults.company_url = SOCIAL_SYSTEMS_LAB_URL;
    defaults.company_address = "";
    defaults.email_signoff_html = `Thanks for being part of Kamooni!<br><br>The Kamooni Team at <a href="${SOCIAL_SYSTEMS_LAB_URL}">Social Systems Lab</a>`;
    defaults.email_signoff_text = `Thanks for being part of Kamooni!\n\nThe Kamooni Team at Social Systems Lab\n${SOCIAL_SYSTEMS_LAB_URL}`;
    defaults.name = templateModel.name || "User";
    defaults.action_url = actionUrl;
    if (actionText) {
        defaults.action_text = actionText;
        defaults.button_text = actionText;
    }
    if (introText) {
        defaults.intro_text = introText;
    }
    if (bodyText) {
        defaults.body_text = bodyText;
    }
    if (summaryText) {
        defaults.summary_text = summaryText;
    }
    defaults.support_email = "hello@socialsystems.io";
    defaults.current_year = new Date().getFullYear().toString();

    return defaults;
};

/**
 * Sends an email using Postmark.
 * @param options - Email sending options.
 * @returns Promise<void>
 * @throws Error if Postmark client is not configured or if email sending fails.
 */
const sendWithPostmark = async (options: EmailOptions): Promise<void> => {
    if (!client || !POSTMARK_SENDER_EMAIL) throw new Error("Email transport is not configured.");
    const { to, templateAlias, templateModel } = options;
    const message = new TemplatedMessage(
        POSTMARK_SENDER_EMAIL,
        templateAlias,
        applyEmailTemplateDefaults(templateModel),
        to,
    );
    try {
        console.log(`Attempting to send email to ${to} using template ${templateAlias}`);
        const response = await client.sendEmailWithTemplate(message);
        console.log(`Email sent successfully to ${to}:`, response);
    } catch (error) {
        console.error(`Failed to send email to ${to} using template ${templateAlias}:`, error);
        throw new Error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`);
    }
};

const defaultDeliveryDependencies: EmailDeliveryDependencies = {
    resolveTransport: getEmailTransportConfiguration,
    capture: async (email) => {
        const { storeCapturedEmail } = await import("@/lib/email/captured-emails");
        await storeCapturedEmail(email);
    },
    postmark: sendWithPostmark,
};

export const sendEmailWithDependencies = async (
    options: EmailOptions,
    dependencies: EmailDeliveryDependencies,
): Promise<void> => {
    const transport = dependencies.resolveTransport();
    if (transport.transport === "refused") {
        throw new Error(transport.error);
    }
    if (transport.transport === "capture") {
        try {
            await dependencies.capture({
                to: options.to,
                templateAlias: options.templateAlias,
                templateModel: options.templateModel,
            });
        } catch {
            throw new Error("Captured email persistence failed.");
        }
        console.log(`Email captured using template ${options.templateAlias}.`);
        return;
    }
    if (transport.transport === "unconfigured") {
        console.error("Postmark client is not initialized. POSTMARK_API_TOKEN might be missing.");
        throw new Error("Email transport is not configured.");
    }
    await dependencies.postmark(options);
};

export const sendEmail = async (options: EmailOptions): Promise<void> =>
    sendEmailWithDependencies(options, defaultDeliveryDependencies);

// Specific email sending functions will be added below in subsequent steps.

/**
 * Generates a secure token for email verification or password reset.
 * @returns string - The generated token.
 */
export const generateSecureToken = (length: number = 32): string => {
    return crypto.randomBytes(length).toString("hex");
};

/**
 * Hashes a token using SHA256.
 * @param token - The token to hash.
 * @returns string - The hashed token.
 */
export const hashToken = (token: string): string => {
    return crypto.createHash("sha256").update(token).digest("hex");
};
