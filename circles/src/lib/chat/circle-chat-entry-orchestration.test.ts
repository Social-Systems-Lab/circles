import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { canWriteCircleByLifecycle } from "@/lib/data/circle-lifecycle-policy";
import { authorizeCircleChatEntry } from "./circle-chat-entry-orchestration";

const viewerDid = "did:alice";
const circleId = new ObjectId().toHexString();
const makeCircle = (visibility: "public" | "secret") => ({
    _id: new ObjectId(circleId), circleType: "circle" as const, visibility, moderationStatus: "active" as const,
});

const invoke = async ({ visibility, member, authenticated = true }: { visibility: "public" | "secret"; member: boolean; authenticated?: boolean }) => {
    const effects = { load: 0, writable: 0, ensure: 0, lookup: 0, message: 0, join: 0 };
    const circle = makeCircle(visibility);
    const authorized = await authorizeCircleChatEntry(authenticated ? viewerDid : "", circleId, "write", {
        loadCircle: async () => (effects.load++, circle as any),
        canRead: (did, value) => canReadCircle(did, value, { getMember: async () => member ? ({ userDid: did, circleId } as any) : null }),
        assertWritable: async (value) => { effects.writable++; if (!canWriteCircleByLifecycle(value)) throw new Error("paused"); },
    });
    if (authorized) {
        // Representative downstream effects of ensure, contact lookup/create/message, and join.
        effects.ensure++; effects.lookup++; effects.message++; effects.join++;
    }
    return { authorized, effects };
};

test("ensure/contact/join preflight denies unauthenticated and Secret outsiders before side effects", async () => {
    assert.deepEqual((await invoke({ visibility: "secret", member: false })).effects,
        { load: 1, writable: 0, ensure: 0, lookup: 0, message: 0, join: 0 });
    assert.deepEqual((await invoke({ visibility: "secret", member: true, authenticated: false })).effects,
        { load: 0, writable: 0, ensure: 0, lookup: 0, message: 0, join: 0 });
});

test("Secret members and public outsiders preserve normal ensure/contact/join flow", async () => {
    assert.ok((await invoke({ visibility: "secret", member: true })).authorized);
    assert.ok((await invoke({ visibility: "public", member: false })).authorized);
});

test("entry preflight rejects profile, malformed, missing, and mismatched owners before effects", async () => {
    for (const owner of [
        null,
        { _id: circleId, circleType: "user", visibility: "public" },
        { _id: circleId, visibility: "public" },
        { _id: new ObjectId().toHexString(), circleType: "circle", visibility: "public" },
    ]) {
        let reads = 0;
        let writes = 0;
        const result = await authorizeCircleChatEntry(viewerDid, circleId, "write", {
            loadCircle: async () => owner as any,
            canRead: async () => { reads++; return true; },
            assertWritable: async () => { writes++; },
        });
        assert.equal(result, null);
        assert.equal(reads, 0);
        assert.equal(writes, 0);
    }
});
