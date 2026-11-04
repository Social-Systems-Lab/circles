import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("archived detail route uses the authorized single-conversation loader", () => {
    const source = readFileSync(new URL("../../app/chat/archived/[handle]/page.tsx", import.meta.url), "utf8");
    assert.match(source, /getAuthenticatedUserDid\(\)/);
    assert.match(source, /getChatRoomAction\(handle, "archived"\)/);
    assert.doesNotMatch(source, /listChatRoomsAction/);
    assert.match(source, /notFound\(\)/);
    assert.match(source, /archivedReadOnly/);
});
