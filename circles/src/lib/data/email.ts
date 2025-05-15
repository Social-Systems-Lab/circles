import { ServerClient, TemplatedMessage } from "postmark";
import crypto from "crypto";

const POSTMARK_API_TOKEN = process.env.POSTMARK_API_TOKEN;
const POSTMARK_SENDER_EMAIL = process.env.POSTMARK_SENDER_EMAIL;

if (!POSTMARK_API_TOKEN) {
    console.warn("POSTMARK_API_TOKEN is not set. Email functionality will be disabled.");
}
if (!POSTMARK_SENDER_EMAIL) {
    console.warn("POSTMARK_SENDER_EMAIL is not set. Email functionality will be disabled.");
}

// Initialize Postmark client
// It's okay if token is undefined here; checks below will prevent API calls.
const client = POSTMARK_API_TOKEN ? new ServerClient(POSTMARK_API_TOKEN) : null;

interface EmailOptions {
    to: string;
    templateAlias: string;
    templateModel: Record<string, any>;
}

/**
 * Sends an email using Postmark.
 * @param options - Email sending options.
 * @returns Promise<void>
 * @throws Error if Postmark client is not configured or if email sending fails.
 */
export const sendEmail = async (options: EmailOptions): Promise<void> => {
    if (!client) {
        console.error("Postmark client is not initialized. POSTMARK_API_TOKEN might be missing.");
        // In a real app, you might want to throw an error or handle this more gracefully
        // For now, we'll log and prevent sending if in a non-production environment or if critical.
        // If this is a critical email, you might throw new Error("Email service not configured.");
        return; // Or throw error depending on desired behavior
    }
    if (!POSTMARK_SENDER_EMAIL) {
        console.error("POSTMARK_SENDER_EMAIL is not configured. Cannot send email.");
        return; // Or throw
    }

    const { to, templateAlias, templateModel } = options;

    const message = new TemplatedMessage(POSTMARK_SENDER_EMAIL, templateAlias, templateModel, to);

    // Add common variables that might be useful in all templates
    (message.TemplateModel as any).product_url = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    (message.TemplateModel as any).product_name = "MakeCircles";
    (message.TemplateModel as any).company_name = "Social Systems Lab";
    (message.TemplateModel as any).company_address = "Illerstigen 8, 170 71 Solna, Sweden";
    (message.TemplateModel as any).name = templateModel.name || "User"; // Default to "User" if not provided
    (message.TemplateModel as any).action_url = templateModel.actionUrl;
    (message.TemplateModel as any).support_email = "hello@socialsystems.io";
    (message.TemplateModel as any).current_year = new Date().getFullYear().toString();

    try {
        console.log(`Attempting to send email to ${to} using template ${templateAlias}`);
        const response = await client.sendEmailWithTemplate(message);
        console.log(`Email sent successfully to ${to}:`, response);
    } catch (error) {
        console.error(`Failed to send email to ${to} using template ${templateAlias}:`, error);
        // Rethrow or handle as appropriate for your application's error strategy
        throw new Error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`);
    }
};

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
