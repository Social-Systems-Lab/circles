/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    images: {
        domains: ["*"],
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
};

export default nextConfig;
