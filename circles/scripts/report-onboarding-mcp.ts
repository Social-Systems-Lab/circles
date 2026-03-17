import { getOnboardingMcpStats } from "../src/lib/data/user";

async function main() {
    const stats = await getOnboardingMcpStats();
    console.log(JSON.stringify(stats, null, 2));
    process.exit(0);
}

main().catch((error) => {
    console.error("Failed to load onboarding MCP stats:", error);
    process.exit(1);
});
