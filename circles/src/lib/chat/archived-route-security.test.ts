import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("archived detail route requires authenticated participant access and per-user archived listing membership", () => {
    const source = readFileSync(new URL("../../app/chat/archived/[handle]/page.tsx", import.meta.url), "utf8");
    assert.match(source, /getAuthenticatedUserDid\(\)/);
    assert.match(source, /resolveMongoConversationAccess\(handle, userDid, "read"\)/);
    assert.match(source, /listChatRoomsAction\("archived"\)/);
    assert.match(source, /!access\.ok \|\| !chatRoom \|\| access\.conversation\?\.type !== "dm"/);
    assert.match(source, /notFound\(\)/);
    assert.match(source, /archivedReadOnly/);
});
