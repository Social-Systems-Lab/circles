import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("src/app/chat/layout.tsx", "utf8");
const page = readFileSync("src/components/modules/chat/message-follow-up-list.tsx", "utf8");

test("follow-ups has a static route and mutually exclusive message navigation state", () => {
    assert.equal(existsSync("src/app/chat/follow-ups/page.tsx"), true);
    assert.match(layout, /const isFollowUpsRoute = pathname\.startsWith\("\/chat\/follow-ups"\)/);
    assert.match(layout, /const isMessagesRoute = !isArchivedRoute && !isFollowUpsRoute/);
    assert.match(layout, /aria-current=\{isFollowUpsRoute \? "page" : undefined\}/);
    assert.match(layout, /aria-current=\{isMessagesRoute \? "page" : undefined\}/);
    assert.match(layout, /aria-current=\{isArchivedRoute \? "page" : undefined\}/);
});

test("page provides lazy filters, empty-page continuation, safe unavailable content and interim links", () => {
    assert.match(page, /const \[activeFilter, setActiveFilter\] = useState<FilterName>\("open"\)/);
    assert.match(page, /completed: filter === "completed"/);
    assert.match(page, /limit: 25/);
    assert.match(page, /active\.nextCursor &&/);
    assert.match(page, /This saved message is no longer available/);
    assert.match(page, /message\.topicId[\s\S]*?`\?topic=\$\{message\.topicId\}`/);
    assert.doesNotMatch(page, /messageId=/);
    assert.match(page, /router\.push\("\/chat"\)/);
});

test("page keeps mutations local and exposes accessible mobile controls", () => {
    assert.match(page, /updateFollowUpNoteInItems/);
    assert.match(page, /moveFollowUpBetweenFilters/);
    assert.match(page, /aria-label="Back to messages"/);
    assert.match(page, /<Tabs value=\{activeFilter\}/);
    assert.match(page, /<TabsList .*aria-label="Follow-up status"/);
    assert.match(page, /<TabsTrigger/);
    assert.match(page, /<TabsContent value=\{activeFilter\}/);
    assert.match(page, /aria-live="polite"/);
    assert.match(page, /role="alert"/);
    assert.match(page, /className="h-11/);
    assert.match(page, /w-\[calc\(100%-1\.5rem\)\]/);
    assert.doesNotMatch(page, /setInterval|UserToolbox|user-toolbox/);
});

test("list requests are deduplicated and reconciled with successful mutations", () => {
    assert.match(page, /inFlightRef\.current\[filter\]/);
    assert.match(page, /requestGenerationRef/);
    assert.match(page, /requestMutationVersion/);
    assert.match(page, /reconcileFollowUpListResponse/);
    assert.match(page, /recordMutation\(editing\.followUp\.id\)/);
    assert.match(page, /recordMutation\(id, completed \? "completed" : "open"\)/);
});

test("the three message views use compact truncating navigation controls", () => {
    assert.equal((layout.match(/h-11 min-w-0 justify-center gap-1 px-1 text-xs/g) || []).length, 3);
    assert.equal((layout.match(/min-w-0 truncate/g) || []).length, 3);
});
