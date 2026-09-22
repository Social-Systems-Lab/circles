/** @type {import('next').NextConfig} */

import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
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
    webpack: (config) => {
        // minio's bundled notification client imports "stream-json/jsonl/Parser.js" (capital P), but
        // stream-json 3.x ships the file as lowercase "parser.js". macOS's case-insensitive filesystem
        // hides this; Linux (our Docker build) does not, and the build fails with "Module not found".
        // The app never uses minio's bucket-notification API, so this alias exists purely to let the
        // build resolve minio's dead code path, redirecting the broken specifier to the real file.
        config.resolve.alias["stream-json/jsonl/Parser.js"] = require.resolve("stream-json/jsonl/parser.js");
        return config;
    },
};

export default nextConfig;
