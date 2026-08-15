import { PlatformAuditEvents } from "@/lib/data/db";
import type { PlatformAuditEvent } from "@/models/models";

export async function appendPlatformAuditEvent(event: Omit<PlatformAuditEvent, "_id" | "occurredAt">) {
    const record: PlatformAuditEvent = { ...event, occurredAt: new Date() };
    const result = await PlatformAuditEvents.insertOne(record);
    return { ...record, _id: result.insertedId.toString() };
}
