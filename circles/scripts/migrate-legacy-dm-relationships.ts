import { migrateLegacyDmRelationships } from "@/lib/data/relationships";

const args = new Set(process.argv.slice(2));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const parsedLimit = limitArg ? Number.parseInt(limitArg.split("=")[1] || "", 10) : undefined;

const main = async () => {
    const result = await migrateLegacyDmRelationships({
        apply: args.has("--apply"),
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });

    console.log(
        JSON.stringify(
            {
                mode: args.has("--apply") ? "apply" : "dry-run",
                ...result,
            },
            null,
            2,
        ),
    );
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Failed to migrate legacy DM relationships:", error);
        process.exit(1);
    });
