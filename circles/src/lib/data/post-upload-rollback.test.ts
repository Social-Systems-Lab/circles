import assert from "node:assert/strict";
import { cleanupUploadedFiles } from "@/lib/data/post-upload-rollback";

const run = async () => {
    const deleted: string[] = [];
    const result = await cleanupUploadedFiles([], async (url) => {
        deleted.push(url);
    });
    assert.deepEqual(deleted, [], "no uploaded files means no file deletion attempts");
    assert.deepEqual(result, { deletedUrls: [], failedDeletes: [] }, "empty cleanup result is explicit");
};

const runSavedOrderTest = async () => {
    const deleted: string[] = [];
    const result = await cleanupUploadedFiles([{ url: "/storage/a" }, { url: "/storage/b" }], async (url) => {
        deleted.push(url);
    });
    assert.deepEqual(deleted, ["/storage/a", "/storage/b"], "cleanup attempts files in saved order");
    assert.deepEqual(result.deletedUrls, ["/storage/a", "/storage/b"], "successful deletions are reported");
    assert.deepEqual(result.failedDeletes, [], "successful cleanup has no failures");
};

const runContinuesAfterFailureTest = async () => {
    const attempted: string[] = [];
    const result = await cleanupUploadedFiles(
        [{ url: "/storage/a" }, { url: "/storage/b" }, { url: "/storage/c" }],
        async (url) => {
            attempted.push(url);
            if (url === "/storage/b") {
                throw new Error("delete failed");
            }
        },
    );
    assert.deepEqual(attempted, ["/storage/a", "/storage/b", "/storage/c"], "cleanup continues after a failure");
    assert.deepEqual(result.deletedUrls, ["/storage/a", "/storage/c"], "successful deletions are still reported");
    assert.equal(result.failedDeletes.length, 1, "failed deletion is captured");
    assert.equal(result.failedDeletes[0].url, "/storage/b", "failed deletion keeps the original url");
};

const runAll = async () => {
    await run();
    await runSavedOrderTest();
    await runContinuesAfterFailureTest();
    console.log("post upload rollback tests passed");
};

runAll().catch((error) => {
    console.error(error);
    process.exit(1);
});
