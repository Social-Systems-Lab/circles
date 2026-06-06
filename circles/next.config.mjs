/** @type {import('next').NextConfig} */

import fs from "fs";
const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf8"));
const version = packageJson.version;
const devSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.CIRCLES_URL;
const allowedDevOrigins = [];
const imageRemotePatterns = [];

const addImageRemotePattern = (urlString) => {
    if (!urlString) return;

    try {
        const url = new URL(urlString);
        if (url.protocol !== "http:" && url.protocol !== "https:") return;

        const pattern = {
            protocol: url.protocol.slice(0, -1),
            hostname: url.hostname,
            pathname: "/**",
        };
        if (url.port) {
            pattern.port = url.port;
        }

        const key = JSON.stringify(pattern);
        if (!imageRemotePatterns.some((existing) => JSON.stringify(existing) === key)) {
            imageRemotePatterns.push(pattern);
        }
    } catch {
        // Ignore invalid image origins.
    }
};

if (devSiteUrl) {
    try {
        allowedDevOrigins.push(new URL(devSiteUrl).origin);
    } catch {
        // Ignore invalid local env values; Next will keep its default dev-origin behavior.
    }
}

[
    "https://kamooni.org",
    "https://www.kamooni.org",
    process.env.CIRCLES_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
].forEach(addImageRemotePattern);

(process.env.NEXT_IMAGE_REMOTE_HOSTS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .forEach(addImageRemotePattern);

if (process.env.NODE_ENV !== "production") {
    ["http://localhost:3000", "http://127.0.0.1:3000"].forEach(addImageRemotePattern);
}

const nextConfig = {
    output: "standalone",
    allowedDevOrigins,
    images: {
        remotePatterns: imageRemotePatterns,
    },
    env: {
        version,
    },
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    {
                        key: "X-Content-Type-Options",
                        value: "nosniff",
                    },
                    {
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                    {
                        key: "X-Frame-Options",
                        value: "DENY",
                    },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
                    },
                ],
            },
        ];
    },
    async rewrites() {
    const minioHost =
        process.env.NODE_ENV === "production"
            ? "minio"
            : process.env.MINIO_HOST || "127.0.0.1";
    const minioPort = process.env.MINIO_PORT || "9000";

    return [
        {
            source: "/storage/:path*",
            destination: `http://${minioHost}:${minioPort}/circles/:path*`,
        },
    ];
},
    experimental: {
        serverActions: {
            bodySizeLimit: "50mb",
        },
    },
};

export default nextConfig;
