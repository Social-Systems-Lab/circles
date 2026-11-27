/** @type {import('next').NextConfig} */

import fs from "fs";
const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf8"));
const version = packageJson.version;
const devSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.CIRCLES_URL;
const allowedDevOrigins = [];

if (devSiteUrl) {
    try {
        allowedDevOrigins.push(new URL(devSiteUrl).origin);
    } catch {
        // Ignore invalid local env values; Next will keep its default dev-origin behavior.
    }
}

const nextConfig = {
    output: "standalone",
    allowedDevOrigins,
    images: {
        remotePatterns: [
            {
                protocol: "http",
                hostname: "**",
            },
            {
                protocol: "https",
                hostname: "**",
            },
        ],
    },
    env: {
        version,
    },
    experimental: {
        serverActions: {
            bodySizeLimit: "50mb",
        },
    },
    async headers() {
        return [
            {
                source: "/sw.js",
                headers: [
                    {
                        key: "Content-Type",
                        value: "application/javascript; charset=utf-8",
                    },
                    {
                        key: "Cache-Control",
                        value: "no-cache, no-store, must-revalidate",
                    },
                    {
                        key: "Service-Worker-Allowed",
                        value: "/",
                    },
                ],
            },
            {
                source: "/manifest.webmanifest",
                headers: [
                    {
                        key: "Content-Type",
                        value: "application/manifest+json; charset=utf-8",
                    },
                    {
                        key: "Cache-Control",
                        value: "public, max-age=3600, must-revalidate",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
