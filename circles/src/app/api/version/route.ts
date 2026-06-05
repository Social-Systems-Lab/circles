import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

type BuildMetadata = {
    version?: string;
    gitSha?: string;
    buildTime?: string;
};

const VERSION_FILE_CANDIDATES = [path.join(process.cwd(), "VERSION"), "/app/VERSION"];

async function readPackageVersion(): Promise<string> {
    try {
        const packageJsonPath = path.join(process.cwd(), "package.json");
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as { version?: string };
        return packageJson.version || "unknown";
    } catch {
        return "unknown";
    }
}

async function readBuildMetadataFile(): Promise<BuildMetadata> {
    for (const filePath of VERSION_FILE_CANDIDATES) {
        try {
            const raw = await fs.readFile(filePath, "utf8");
            const metadata: BuildMetadata = {};

            for (const line of raw.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) continue;
                const equalsIndex = trimmed.indexOf("=");
                if (equalsIndex < 0) continue;

                const key = trimmed.slice(0, equalsIndex).trim();
                const value = trimmed.slice(equalsIndex + 1).trim();
                if (!value) continue;

                if (key === "version") metadata.version = value;
                if (key === "gitSha") metadata.gitSha = value;
                if (key === "buildTime") metadata.buildTime = value;
            }

            return metadata;
        } catch {
            // Try next candidate path.
        }
    }

    return {};
}

export async function GET() {
    const fileMetadata = await readBuildMetadataFile();
    const packageVersion = await readPackageVersion();

    const version = fileMetadata.version || process.env.APP_VERSION || packageVersion || "unknown";
    const gitSha = fileMetadata.gitSha || process.env.GIT_SHA || "unknown";
    const buildTime = fileMetadata.buildTime || process.env.BUILD_TIME || "unknown";

    return NextResponse.json(
        { version, gitSha, buildTime },
        {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                Pragma: "no-cache",
                Expires: "0",
            },
        },
    );
}
