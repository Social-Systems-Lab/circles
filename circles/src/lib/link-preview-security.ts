import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { getPreviewFromContent } from "link-preview-js";

const PREVIEW_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export const LINK_PREVIEW_HEADERS = {
    "User-Agent": "KamooniBot/1.0 (+https://kamooni.org/bot)",
    "Accept-Language": "en-US,en;q=0.9",
} as const;

export type ResolvedAddress = { address: string; family: 4 | 6 };

export type LinkPreviewDependencies = {
    resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
    request?: typeof requestPinnedUrl;
};

export type SafeLinkPreview = {
    url: string;
    title?: string;
    description?: string;
    image?: string;
    mediaType?: string;
    contentType?: string;
    favicons?: string[];
};

export type LinkPreviewActionResult = { success: boolean; preview?: SafeLinkPreview; error?: string };

const ipv4Number = (address: string): number | undefined => {
    const parts = address.split(".");
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
        return undefined;
    }
    return parts.reduce((value, part) => value * 256 + Number(part), 0) >>> 0;
};

const inIpv4Range = (address: number, base: string, prefix: number): boolean => {
    const baseNumber = ipv4Number(base)!;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (address & mask) === (baseNumber & mask);
};

const isPublicIpv4 = (address: string): boolean => {
    const value = ipv4Number(address);
    if (value === undefined) return false;

    return ![
        ["0.0.0.0", 8],
        ["10.0.0.0", 8],
        ["100.64.0.0", 10],
        ["127.0.0.0", 8],
        ["169.254.0.0", 16],
        ["172.16.0.0", 12],
        ["192.0.0.0", 24],
        ["192.0.2.0", 24],
        ["192.88.99.0", 24],
        ["192.168.0.0", 16],
        ["198.18.0.0", 15],
        ["198.51.100.0", 24],
        ["203.0.113.0", 24],
        ["224.0.0.0", 4],
        ["240.0.0.0", 4],
    ].some(([base, prefix]) => inIpv4Range(value, base as string, prefix as number));
};

const parseIpv6 = (address: string): number[] | undefined => {
    const withoutZone = address.toLowerCase().split("%")[0];
    const halves = withoutZone.split("::");
    if (halves.length > 2) return undefined;

    const parseSide = (side: string): number[] | undefined => {
        if (!side) return [];
        const groups: number[] = [];
        for (const part of side.split(":")) {
            if (part.includes(".")) {
                const ipv4 = ipv4Number(part);
                if (ipv4 === undefined) return undefined;
                groups.push((ipv4 >>> 16) & 0xffff, ipv4 & 0xffff);
            } else if (!/^[0-9a-f]{1,4}$/.test(part)) {
                return undefined;
            } else {
                groups.push(Number.parseInt(part, 16));
            }
        }
        return groups;
    };

    const left = parseSide(halves[0]);
    const right = parseSide(halves[1] ?? "");
    if (!left || !right) return undefined;
    const missing = 8 - left.length - right.length;
    if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return undefined;
    const groups = [...left, ...Array(missing).fill(0), ...right];
    if (groups.length !== 8) return undefined;
    return groups.flatMap((group) => [group >>> 8, group & 0xff]);
};

const inIpv6Range = (address: number[], base: string, prefix: number): boolean => {
    const baseBytes = parseIpv6(base)!;
    const fullBytes = Math.floor(prefix / 8);
    const remainingBits = prefix % 8;
    if (address.slice(0, fullBytes).some((byte, index) => byte !== baseBytes[index])) return false;
    if (remainingBits === 0) return true;
    const mask = (0xff << (8 - remainingBits)) & 0xff;
    return (address[fullBytes] & mask) === (baseBytes[fullBytes] & mask);
};

const isPublicIpv6 = (address: string): boolean => {
    const value = parseIpv6(address);
    if (value === undefined) return false;

    // Public link previews need only globally routable IPv6 unicast (2000::/3).
    if (!inIpv6Range(value, "2000::", 3)) return false;

    return ![
        ["2001::", 32], // Teredo/special-purpose
        ["2001:2::", 48], // benchmarking
        ["2001:10::", 28], // ORCHID
        ["2001:20::", 28], // ORCHIDv2
        ["2001:db8::", 32], // documentation
        ["2002::", 16], // deprecated 6to4
        ["3fff::", 20], // documentation
    ].some(([base, prefix]) => inIpv6Range(value, base as string, prefix as number));
};

export const isPublicIpAddress = (address: string): boolean => {
    const normalized = address.replace(/^\[|\]$/g, "");
    const family = isIP(normalized);
    if (family === 4) return isPublicIpv4(normalized);
    if (family === 6) return isPublicIpv6(normalized);
    return false;
};

export const parsePublicPreviewUrl = (input: string): URL => {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported URL protocol");
    if (url.username || url.password) throw new Error("URL credentials are not allowed");
    if (!url.hostname) throw new Error("URL host is required");
    return url;
};

const defaultResolve = async (hostname: string): Promise<ResolvedAddress[]> => {
    const results = await dnsLookup(hostname, { all: true, verbatim: true });
    return results.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
};

const withinTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Preview request timed out")), timeoutMs);
                timer.unref();
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

export const resolvePublicDestination = async (
    url: URL,
    resolve: (hostname: string) => Promise<ResolvedAddress[]> = defaultResolve,
): Promise<ResolvedAddress> => {
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    const literalFamily = isIP(literal);
    const addresses = literalFamily
        ? [{ address: literal, family: literalFamily as 4 | 6 }]
        : await resolve(url.hostname);

    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
        throw new Error("Destination is not public");
    }
    return addresses[0];
};

type PinnedResponse = { status: number; headers: Record<string, string>; data: string };

export const requestPinnedUrl = (
    url: URL,
    pinned: ResolvedAddress,
    timeoutMs: number,
    headers: Record<string, string> = LINK_PREVIEW_HEADERS,
): Promise<PinnedResponse> =>
    new Promise((resolve, reject) => {
        const client = url.protocol === "https:" ? https : http;
        const request = client.request(
            url,
            {
                headers,
                family: pinned.family,
                lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
            },
            (response) => {
                const chunks: Buffer[] = [];
                let size = 0;
                response.on("data", (chunk: Buffer) => {
                    size += chunk.length;
                    if (size > MAX_RESPONSE_BYTES) {
                        request.destroy(new Error("Preview response is too large"));
                        return;
                    }
                    chunks.push(chunk);
                });
                response.on("end", () => {
                    const headers: Record<string, string> = {};
                    for (const [name, value] of Object.entries(response.headers)) {
                        if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(", ") : value;
                    }
                    resolve({
                        status: response.statusCode ?? 0,
                        headers,
                        data: Buffer.concat(chunks).toString("utf8"),
                    });
                });
            },
        );
        request.setTimeout(timeoutMs, () => request.destroy(new Error("Preview request timed out")));
        request.on("error", reject);
        request.end();
    });

export const fetchPublicPreviewResource = async (
    input: string,
    dependencies: LinkPreviewDependencies = {},
): Promise<{ url: string; headers: Record<string, string>; data: string }> => {
    const resolve = dependencies.resolve ?? defaultResolve;
    const request = dependencies.request ?? requestPinnedUrl;
    const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
    let url = parsePublicPreviewUrl(input);

    for (let redirects = 0; ; redirects += 1) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("Preview request timed out");
        const pinned = await withinTimeout(resolvePublicDestination(url, resolve), remaining);
        const response = await request(url, pinned, remaining, LINK_PREVIEW_HEADERS);

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            if (redirects >= MAX_REDIRECTS) throw new Error("Too many redirects");
            const location = response.headers.location;
            if (!location) throw new Error("Redirect is missing a location");
            url = parsePublicPreviewUrl(new URL(location, url).href);
            continue;
        }
        return { url: url.href, headers: response.headers, data: response.data };
    }
};

export const getSafeLinkPreview = async (input: string, dependencies: LinkPreviewDependencies = {}) => {
    const resource = await fetchPublicPreviewResource(input, dependencies);
    return getPreviewFromContent(resource);
};

export const runAuthenticatedLinkPreview = async (
    input: string,
    getViewerDid: () => Promise<string | undefined>,
    dependencies: LinkPreviewDependencies = {},
): Promise<LinkPreviewActionResult> => {
    if (!(await getViewerDid())) return { success: false, error: "Authentication required." };

    try {
        const raw = (await getSafeLinkPreview(input, dependencies)) as Record<string, unknown>;
        let image = Array.isArray(raw.images) && typeof raw.images[0] === "string" ? raw.images[0] : undefined;
        if (image && !image.startsWith("http")) {
            try {
                image = new URL(image, String(raw.url)).href;
            } catch {
                image = undefined;
            }
        }
        const preview: SafeLinkPreview = {
            url: String(raw.url),
            title: typeof raw.title === "string" ? raw.title : undefined,
            description: typeof raw.description === "string" ? raw.description : undefined,
            image,
            mediaType: typeof raw.mediaType === "string" ? raw.mediaType : undefined,
            contentType: typeof raw.contentType === "string" ? raw.contentType : undefined,
            favicons: Array.isArray(raw.favicons)
                ? raw.favicons.filter((value): value is string => typeof value === "string")
                : undefined,
        };
        if (!preview.title && !preview.description && !preview.image) {
            return { success: false, error: "Could not fetch a valid link preview (missing metadata)." };
        }
        return { success: true, preview };
    } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes("timed out")) {
            return { success: false, error: "Fetching preview timed out." };
        }
        return { success: false, error: "Failed to fetch link preview." };
    }
};
