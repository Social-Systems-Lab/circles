import { readFileSync } from "node:fs";
import { ServerClient, TemplatedMessage } from "postmark";
import nodemailer from "nodemailer";
import crypto from "crypto";

const SOCIAL_SYSTEMS_LAB_URL = "https://www.socialsystems.io/";
const DEPLOYMENT_ROLE_FILE = "/app/.kamooni-deployment-role";
const STAGING_ORIGIN = "https://staging.kamooni.org";

export interface EmailOptions {
    to: string;
    templateAlias: string;
    templateModel: Record<string, any>;
}

export type EmailDeploymentRole = "production" | "staging" | "development";
type EmailTransport = "postmark" | "mailpit";

type EmailTransportConfiguration =
    | { role: "production"; transport: "postmark"; token: string; sender: string }
    | { role: "staging"; transport: "mailpit"; host: "mailpit"; port: 1025; origin: typeof STAGING_ORIGIN }
    | { role: "development"; transport: "mailpit"; host: string; port: number; origin: string };

type EmailEnvironment = Record<string, string | undefined>;

export class EmailDeliveryError extends Error {
    constructor() {
        super("Email delivery is unavailable. Please try again later.");
        this.name = "EmailDeliveryError";
    }
}

function runtimeDeploymentRole(): EmailDeploymentRole {
    try {
        const role = readFileSync(DEPLOYMENT_ROLE_FILE, "utf8").trim();
        if (role === "production" || role === "staging") return role;
        throw new EmailDeliveryError();
    } catch (error) {
        if (error instanceof EmailDeliveryError) throw error;
        if (process.env.NODE_ENV !== "production") return "development";
        throw new EmailDeliveryError();
    }
}

function requireValue(env: EmailEnvironment, key: string): string {
    const value = env[key]?.trim();
    if (!value) throw new EmailDeliveryError();
    return value;
}

function parsePort(value: string | undefined): number {
    if (!value || !/^\d{1,5}$/.test(value)) throw new EmailDeliveryError();
    const port = Number(value);
    if (port < 1 || port > 65535) throw new EmailDeliveryError();
    return port;
}

export function resolveEmailTransportConfiguration(
    role: EmailDeploymentRole,
    env: EmailEnvironment,
): EmailTransportConfiguration {
    const transport = env.EMAIL_TRANSPORT as EmailTransport | undefined;
    if (transport !== "postmark" && transport !== "mailpit") throw new EmailDeliveryError();

    if (role === "production") {
        if (transport !== "postmark") throw new EmailDeliveryError();
        return {
            role,
            transport,
            token: requireValue(env, "POSTMARK_API_TOKEN"),
            sender: requireValue(env, "POSTMARK_SENDER_EMAIL"),
        };
    }

    if (transport !== "mailpit" || env.POSTMARK_API_TOKEN?.trim() || env.POSTMARK_SENDER_EMAIL?.trim()) {
        throw new EmailDeliveryError();
    }

    if (role === "staging") {
        if (
            env.MAILPIT_SMTP_HOST !== "mailpit" ||
            env.MAILPIT_SMTP_PORT !== "1025" ||
            env.CIRCLES_URL !== STAGING_ORIGIN
        ) {
            throw new EmailDeliveryError();
        }
        return { role, transport, host: "mailpit", port: 1025, origin: STAGING_ORIGIN };
    }

    const host = requireValue(env, "MAILPIT_SMTP_HOST");
    const port = parsePort(env.MAILPIT_SMTP_PORT);
    if (!new Set(["127.0.0.1", "localhost", "::1"]).has(host)) throw new EmailDeliveryError();
    const origin = requireValue(env, "CIRCLES_URL").replace(/\/+$/, "");
    const parsedOrigin = new URL(origin);
    if (!new Set(["localhost", "127.0.0.1", "::1"]).has(parsedOrigin.hostname)) throw new EmailDeliveryError();
    return { role, transport, host, port, origin };
}

const getTemplateString = (templateModel: Record<string, any>, ...keys: string[]): string | undefined => {
    for (const key of keys) {
        const value = templateModel[key];
        if (typeof value === "string" && value.trim().length > 0) return value;
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
    if (introText) defaults.intro_text = introText;
    if (bodyText) defaults.body_text = bodyText;
    if (summaryText) defaults.summary_text = summaryText;
    defaults.support_email = "hello@socialsystems.io";
    defaults.current_year = new Date().getFullYear().toString();
    return defaults;
};

const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) => {
        switch (character) {
            case "&":
                return "&amp;";
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case '"':
                return "&quot;";
            default:
                return "&#39;";
        }
    });

function validatePendingVerificationMessage(options: EmailOptions, origin: string): { name: string; url: URL } {
    if (options.templateAlias !== "email-verification") throw new EmailDeliveryError();
    const actionUrl = getTemplateString(options.templateModel, "actionUrl", "action_url");
    const name = getTemplateString(options.templateModel, "name") || "there";
    if (!actionUrl) throw new EmailDeliveryError();

    try {
        const url = new URL(actionUrl);
        const tokenKeys = [...url.searchParams.keys()];
        if (
            url.origin !== origin ||
            !new Set(["/signup/verify", "/verify-email"]).has(url.pathname) ||
            url.username ||
            url.password ||
            url.hash ||
            tokenKeys.length !== 1 ||
            tokenKeys[0] !== "token" ||
            !url.searchParams.get("token")
        ) {
            throw new EmailDeliveryError();
        }
        return { name, url };
    } catch {
        throw new EmailDeliveryError();
    }
}

function errorCategory(error: unknown): string {
    if (!error || typeof error !== "object") return "unknown";
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_-]{1,32}$/.test(code)) return code;
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(name)) return name;
    return "unknown";
}

export type EmailSenderDependencies = {
    role: EmailDeploymentRole;
    env: EmailEnvironment;
    sendPostmark: (
        configuration: Extract<EmailTransportConfiguration, { transport: "postmark" }>,
        options: EmailOptions,
    ) => Promise<unknown>;
    sendMailpit: (
        configuration: Extract<EmailTransportConfiguration, { transport: "mailpit" }>,
        message: { from: string; to: string; subject: string; text: string; html: string },
    ) => Promise<unknown>;
    logError: (event: string, details: Record<string, string>) => void;
};

export async function sendEmailWithDependencies(
    options: EmailOptions,
    dependencies: EmailSenderDependencies,
): Promise<void> {
    let configuration: EmailTransportConfiguration;
    try {
        configuration = resolveEmailTransportConfiguration(dependencies.role, dependencies.env);
        if (configuration.transport === "postmark") {
            await dependencies.sendPostmark(configuration, options);
            return;
        }

        const { name, url } = validatePendingVerificationMessage(options, configuration.origin);
        const safeName = escapeHtml(name);
        const safeUrl = escapeHtml(url.toString());
        const text = `Hello ${name},\n\nVerify your email address to continue your Kamooni signup:\n${url.toString()}\n`;
        const html = `<p>Hello ${safeName},</p><p>Verify your email address to continue your Kamooni signup.</p><p><a href="${safeUrl}">Verify email address</a></p>`;
        await dependencies.sendMailpit(configuration, {
            from:
                configuration.role === "staging"
                    ? "Kamooni Staging <no-reply@staging.kamooni.org>"
                    : "Kamooni Local <no-reply@localhost>",
            to: options.to,
            subject: "Verify your Kamooni email address",
            text,
            html,
        });
    } catch (error) {
        const provider = (() => {
            try {
                return resolveEmailTransportConfiguration(dependencies.role, dependencies.env).transport;
            } catch {
                return "configuration";
            }
        })();
        dependencies.logError("Email delivery failed", {
            provider,
            template: /^[a-z0-9-]{1,64}$/.test(options.templateAlias) ? options.templateAlias : "invalid",
            error: errorCategory(error),
        });
        throw new EmailDeliveryError();
    }
}

async function sendPostmark(
    configuration: Extract<EmailTransportConfiguration, { transport: "postmark" }>,
    options: EmailOptions,
): Promise<unknown> {
    const client = new ServerClient(configuration.token);
    const message = new TemplatedMessage(
        configuration.sender,
        options.templateAlias,
        applyEmailTemplateDefaults(options.templateModel),
        options.to,
    );
    return client.sendEmailWithTemplate(message);
}

async function sendMailpit(
    configuration: Extract<EmailTransportConfiguration, { transport: "mailpit" }>,
    message: { from: string; to: string; subject: string; text: string; html: string },
): Promise<unknown> {
    const transport = nodemailer.createTransport({
        host: configuration.host,
        port: configuration.port,
        secure: false,
        connectionTimeout: 5_000,
        greetingTimeout: 5_000,
        socketTimeout: 10_000,
    });
    try {
        return await transport.sendMail(message);
    } finally {
        transport.close();
    }
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
    let role: EmailDeploymentRole;
    try {
        role = runtimeDeploymentRole();
    } catch {
        console.error("Email delivery failed", { provider: "configuration", error: "invalid_runtime_configuration" });
        throw new EmailDeliveryError();
    }
    await sendEmailWithDependencies(options, {
        role,
        env: process.env,
        sendPostmark,
        sendMailpit,
        logError: (event, details) => console.error(event, details),
    });
};

/** Generates a secure token for email verification or password reset. */
export const generateSecureToken = (length: number = 32): string => crypto.randomBytes(length).toString("hex");

/** Hashes a token using SHA256. */
export const hashToken = (token: string): string => crypto.createHash("sha256").update(token).digest("hex");
