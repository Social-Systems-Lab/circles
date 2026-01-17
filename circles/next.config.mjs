/** @type {import('next').NextConfig} */

import fs from "fs";
const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf8"));
const version = packageJson.version;

const nextConfig = {
    output: "standalone",
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
    async rewrites() {
        return [
            {
                source: "/storage/:path*",
                destination: "http://minio:9000/circles/:path*",
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
