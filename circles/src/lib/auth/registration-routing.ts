import type { Collection, Db } from "mongodb";

export type RegistrationMode = "legacy" | "paused" | "pending";

export type RegistrationRoutingRecord = {
    _id: "registration-routing";
    mode: RegistrationMode;
    deploymentId: string | null;
    updatedAt: Date;
    updatedBy: string;
};

export type RegistrationRoutingCollection = Pick<
    Collection<RegistrationRoutingRecord>,
    "findOne" | "findOneAndUpdate" | "createIndex"
>;

const ROUTING_ID = "registration-routing" as const;

export async function getRegistrationRouting(
    collection?: RegistrationRoutingCollection,
): Promise<RegistrationRoutingRecord> {
    const records = collection ?? (await registrationRoutingCollection());
    const record = await records.findOne({ _id: ROUTING_ID });
    return (
        record ?? {
            _id: ROUTING_ID,
            mode: "legacy",
            deploymentId: null,
            updatedAt: new Date(0),
            updatedBy: "safe-default",
        }
    );
}

export async function isRegistrationModeAllowed(
    expected: Exclude<RegistrationMode, "paused">,
    collection?: RegistrationRoutingCollection,
): Promise<boolean> {
    const routing = await getRegistrationRouting(collection);
    if (routing.mode !== expected) return false;
    if (!routing.deploymentId) return expected === "legacy";
    return (
        Boolean(process.env.REGISTRATION_DEPLOYMENT_ID) &&
        process.env.REGISTRATION_DEPLOYMENT_ID === routing.deploymentId
    );
}

export async function assertRegistrationMode(
    expected: Exclude<RegistrationMode, "paused">,
    collection?: RegistrationRoutingCollection,
): Promise<void> {
    if (!(await isRegistrationModeAllowed(expected, collection))) {
        throw new Error("Registration is temporarily unavailable.");
    }
}

export async function setRegistrationMode(
    input: {
        expectedMode: RegistrationMode;
        mode: RegistrationMode;
        deploymentId: string | null;
        updatedBy: string;
        now?: Date;
    },
    collection?: RegistrationRoutingCollection,
): Promise<boolean> {
    if (input.mode === "pending" && !input.deploymentId) return false;
    const records = collection ?? (await registrationRoutingCollection());
    const result = await records.findOneAndUpdate(
        { _id: ROUTING_ID, mode: input.expectedMode },
        {
            $set: {
                mode: input.mode,
                deploymentId: input.deploymentId,
                updatedAt: input.now ?? new Date(),
                updatedBy: input.updatedBy,
            },
        },
        { returnDocument: "after" },
    );
    return result?.mode === input.mode && result.deploymentId === input.deploymentId;
}

export async function ensureRegistrationRoutingRecord(
    db: Db,
    updatedBy = "milestone-3a-bootstrap",
): Promise<RegistrationRoutingRecord> {
    const records = db.collection<RegistrationRoutingRecord>("registrationRouting");
    await records.createIndex({ mode: 1 });
    const record = await records.findOneAndUpdate(
        { _id: ROUTING_ID },
        {
            $setOnInsert: {
                mode: "legacy",
                deploymentId: null,
                updatedAt: new Date(),
                updatedBy,
            },
        },
        { upsert: true, returnDocument: "after" },
    );
    if (!record) throw new Error("Failed to initialize registration routing");
    return record;
}

async function registrationRoutingCollection(): Promise<RegistrationRoutingCollection> {
    const { getDb } = await import("@/lib/data/db");
    return (await getDb()).collection<RegistrationRoutingRecord>("registrationRouting");
}
