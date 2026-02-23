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
