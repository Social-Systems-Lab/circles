import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle } from "@/models/models";

const originalIsBuild = process.env.IS_BUILD;
process.env.IS_BUILD = "true";

const productionModules = Promise.all([
    import("./circle"),
    import("./private-media"),
    import("./circle-media-storage"),
]);

const circleId = new ObjectId().toHexString();
const file = { name: "photo.png", type: "image/png", size: 3, arrayBuffer: async () => new ArrayBuffer(3) };
const circle = (overrides: Partial<Circle> = {}): Circle => ({
    _id: new ObjectId(circleId),
    circleType: "circle",
    moderationStatus: "active",
    ...overrides,
});

async function run(ownerCircle: Circle, member: boolean) {
    const [, , { saveCircleOwnedFile }] = await productionModules;
    const calls = { member: 0, public: 0, private: 0 };
    const result = await saveCircleOwnedFile(
        { actorDid: "did:actor", ownerCircle, file, fileName: "image", overwrite: true, resourceType: "circle" },
        {
            isMember: async () => ((calls.member += 1), member),
            savePublic: async () => {
                calls.public += 1;
                return { originalName: "photo.png", fileName: "public.png", url: `/storage/${circleId}/public.png` };
            },
            savePrivate: async (input) => {
                calls.private += 1;
                assert.equal(input.circleId, circleId);
                assert.equal(input.uploadedByDid, "did:actor");
                return {
                    mediaId: new ObjectId().toHexString(),
                    storageClass: "private",
                    url: `/private-media/${new ObjectId().toHexString()}`,
                };
            },
        },
    );
    return { result, calls };
}

async function main() {
    const originalCirclesUrl = process.env.CIRCLES_URL;
    process.env.CIRCLES_URL = "https://configured.example";
    try {
        const [{ createCircle }, { deleteCirclePrivateFileWithDependencies }, circleMediaStorage] =
            await productionModules;
        const {
            canRetainSubmittedCircleMediaUrl,
            classifyOwnedMediaUrl,
            cleanupCircleOwnedMedia,
            cleanupMediaBeforeSourceDelete,
            collectReplacedCircleMedia,
            completeFundingPostMutation,
            deleteCircleOwnedMedia,
            persistCircleThenCleanupMedia,
            saveCircleOwnedFile,
            getFundingPostMutationMessage,
        } = circleMediaStorage;
        for (const owner of [circle({ visibility: undefined }), circle({ visibility: "public" })]) {
            const { result, calls } = await run(owner, false);
            assert.match(result.url, /^\/storage\//);
            assert.deepEqual(calls, { member: 0, public: 1, private: 0 });
        }

        const secret = await run(circle({ visibility: "secret" }), true);
        assert.match(secret.result.url, /^\/private-media\/[a-f0-9]{24}$/);
        assert.doesNotMatch(secret.result.url, /storage|uploads|circles-private|circle\//);
        assert.deepEqual(secret.calls, { member: 1, public: 0, private: 1 });

        for (const owner of [
            circle({ visibility: "secret" }),
            circle({ visibility: "secret", moderationStatus: "suspended" }),
            circle({ visibility: "secret", moderationStatus: "removed" }),
        ]) {
            let publicCalls = 0;
            let privateCalls = 0;
            await assert.rejects(
                saveCircleOwnedFile(
                    {
                        actorDid: "did:superadmin",
                        ownerCircle: owner,
                        file,
                        fileName: "image",
                        overwrite: true,
                        resourceType: "circle",
                    },
                    {
                        isMember: async () => false,
                        savePublic: async () => ((publicCalls += 1), Promise.reject(new Error("unexpected"))),
                        savePrivate: async () => ((privateCalls += 1), Promise.reject(new Error("unexpected"))),
                    },
                ),
            );
            assert.equal(publicCalls, 0);
            assert.equal(privateCalls, 0, "denial creates no object or metadata");
        }

        await assert.rejects(
            run(circle({ circleType: "user", visibility: "secret" }), true),
            /User profile circles cannot be secret/,
        );

        assert.deepEqual(classifyOwnedMediaUrl("/private-media/0123456789abcdef01234567"), {
            kind: "private",
            mediaId: "0123456789abcdef01234567",
        });
        assert.deepEqual(classifyOwnedMediaUrl("/storage/owner/file.png"), { kind: "public" });
        assert.deepEqual(classifyOwnedMediaUrl("https://configured.example/storage/owner/file.png"), {
            kind: "public",
        });
        assert.deepEqual(classifyOwnedMediaUrl("https://kamooni.org/storage/owner/file.png"), { kind: "external" });
        assert.deepEqual(classifyOwnedMediaUrl("https://configured.example.attacker.com/storage/owner/file.png"), {
            kind: "external",
        });
        assert.deepEqual(classifyOwnedMediaUrl("https://example.org/storage/owner/file.png"), { kind: "external" });
        assert.deepEqual(classifyOwnedMediaUrl("not a URL"), { kind: "external" });
        assert.deepEqual(classifyOwnedMediaUrl("https://configured.example/storage/owner/file.png?download=1#x"), {
            kind: "external",
        });
        assert.deepEqual(classifyOwnedMediaUrl("/storage/owner/file.png?download=1"), { kind: "external" });

        const uppercaseId = "0123456789ABCDEF01234567";
        assert.deepEqual(classifyOwnedMediaUrl(`/private-media/${uppercaseId}`), {
            kind: "private",
            mediaId: uppercaseId,
        });
        const rejectedPrivateLike = [
            "/private-media/",
            "/private-media/not-an-id",
            "/private-media/123",
            "/private-media/0123456789abcdef01234567/extra",
            "/private-media/../0123456789abcdef01234567",
            "/private-media/%2e%2e/0123456789abcdef01234567",
            "/private-media/0123456789abcdef01234567/",
            "/private-media/0123456789abcdef01234567?x=1",
            "/private-media/0123456789abcdef01234567#fragment",
            "//private-media/0123456789abcdef01234567",
            "circle/0123456789abcdef01234567/object-key.png",
            "https://attacker.example/private-media/0123456789abcdef01234567",
            "//attacker.example/private-media/0123456789abcdef01234567",
            "https://example.org/file.png",
        ];
        let privateDeletes = 0;
        for (const value of rejectedPrivateLike) {
            assert.deepEqual(classifyOwnedMediaUrl(value), { kind: "external" }, value);
            await deleteCircleOwnedMedia(
                { url: value, expectedCircleId: circleId },
                {
                    deletePrivate: async () => {
                        privateDeletes += 1;
                    },
                    deletePublic: async () => undefined,
                },
            );
        }
        assert.equal(privateDeletes, 0, "malformed private-like references never reach private deletion");

        const sameMediaId = new ObjectId().toHexString();
        const foreignMediaId = new ObjectId().toHexString();
        const conversationMediaId = new ObjectId().toHexString();
        const foreignCircleId = new ObjectId().toHexString();
        const privateRecords = new Map<string, any>([
            [
                sameMediaId,
                {
                    storageClass: "private",
                    bucket: "circles-private",
                    objectKey: `circle/${circleId}/123e4567-e89b-42d3-a456-426614174000.png`,
                    ownerType: "circle",
                    circleId,
                    resourceType: "circle",
                },
            ],
            [
                foreignMediaId,
                {
                    storageClass: "private",
                    bucket: "circles-private",
                    objectKey: `circle/${foreignCircleId}/123e4567-e89b-42d3-a456-426614174001.png`,
                    ownerType: "circle",
                    circleId: foreignCircleId,
                    resourceType: "circle",
                },
            ],
            [
                conversationMediaId,
                {
                    storageClass: "private",
                    bucket: "circles-private",
                    objectKey: "conversation/chat-1/123e4567-e89b-42d3-a456-426614174002.png",
                    ownerType: "conversation",
                    conversationId: "chat-1",
                    resourceType: "chat-message",
                },
            ],
        ]);
        let privateObjectDeletes = 0;
        let privateMetadataDeletes = 0;
        let publicDeletes = 0;
        const ownerAwareDependencies = {
            deletePrivate: (mediaId: string, expectedCircleId: string) =>
                deleteCirclePrivateFileWithDependencies(mediaId, expectedCircleId, {
                    findRecord: async () => privateRecords.get(mediaId) ?? null,
                    removeObject: async () => {
                        privateObjectDeletes += 1;
                    },
                    deleteRecord: async () => {
                        privateMetadataDeletes += 1;
                        privateRecords.delete(mediaId);
                    },
                }),
            deletePublic: async () => {
                publicDeletes += 1;
            },
        };
        await deleteCircleOwnedMedia(
            { url: `/private-media/${sameMediaId}`, expectedCircleId: circleId },
            ownerAwareDependencies,
        );
        assert.equal(privateRecords.has(sameMediaId), false, "same-Circle private media is deleted");
        for (const mediaId of [foreignMediaId, conversationMediaId]) {
            await assert.rejects(
                deleteCircleOwnedMedia(
                    { url: `/private-media/${mediaId}`, expectedCircleId: circleId },
                    ownerAwareDependencies,
                ),
                /unavailable/,
            );
            assert.equal(privateRecords.has(mediaId), true, "foreign private media survives Circle cleanup");
        }
        await deleteCircleOwnedMedia(
            { url: "/storage/owner/public.png", expectedCircleId: circleId },
            ownerAwareDependencies,
        );
        await deleteCircleOwnedMedia(
            { url: "https://external.example/image.png", expectedCircleId: circleId },
            ownerAwareDependencies,
        );
        assert.equal(publicDeletes, 1, "public owned media still uses public deletion and external media is ignored");
        assert.deepEqual(
            { privateObjectDeletes, privateMetadataDeletes },
            { privateObjectDeletes: 1, privateMetadataDeletes: 1 },
            "foreign Circle and conversation records never reach object or metadata deletion",
        );

        const mixedSameMediaId = new ObjectId().toHexString();
        privateRecords.set(mixedSameMediaId, {
            ...privateRecords.get(foreignMediaId),
            objectKey: `circle/${circleId}/123e4567-e89b-42d3-a456-426614174003.png`,
            circleId,
        });
        const mixedCleanup = await cleanupCircleOwnedMedia(
            [`/private-media/${mixedSameMediaId}`, `/private-media/${foreignMediaId}`],
            circleId,
            (input) => deleteCircleOwnedMedia(input, ownerAwareDependencies),
        );
        assert.equal(mixedCleanup.status, "failed", "mixed cleanup truthfully reports its partial failure");
        assert.equal(privateRecords.has(mixedSameMediaId), false, "valid same-Circle deletion is not rolled back");
        assert.equal(privateRecords.has(foreignMediaId), true, "foreign media survives mixed cleanup");

        assert.deepEqual(await cleanupCircleOwnedMedia([], circleId), { status: "not-needed" });
        assert.deepEqual(await cleanupCircleOwnedMedia(["one"], circleId, async () => undefined), {
            status: "complete",
        });
        const cleanupError = new Error("cleanup failed");
        const cleanup = await cleanupCircleOwnedMedia(["one"], circleId, async () => Promise.reject(cleanupError));
        assert.equal(cleanup.status, "failed");
        if (cleanup.status === "failed") assert.equal(cleanup.error, cleanupError);

        const oldPicture = { url: "/private-media/aaaaaaaaaaaaaaaaaaaaaaaa" };
        const newPicture = { url: "/private-media/bbbbbbbbbbbbbbbbbbbbbbbb" };
        assert.deepEqual(collectReplacedCircleMedia(oldPicture, oldPicture), []);
        assert.deepEqual(collectReplacedCircleMedia(oldPicture, newPicture), [oldPicture.url]);
        assert.deepEqual(collectReplacedCircleMedia(oldPicture, undefined), [oldPicture.url]);
        assert.equal(
            canRetainSubmittedCircleMediaUrl(circle({ picture: oldPicture }), oldPicture.url),
            true,
            "an exact persisted private reference may be retained",
        );
        assert.equal(
            canRetainSubmittedCircleMediaUrl(circle({ picture: oldPicture }), newPicture.url),
            false,
            "a foreign or otherwise unpersisted private reference is not adopted",
        );
        assert.equal(
            canRetainSubmittedCircleMediaUrl(circle({ picture: oldPicture }), "https://images.example/photo.png"),
            true,
            "existing external URL behavior is preserved",
        );

        const replacementOrder: string[] = [];
        const replacementSuccess = await persistCircleThenCleanupMedia(
            async () => {
                replacementOrder.push("persist-new-picture");
            },
            collectReplacedCircleMedia(oldPicture, newPicture),
            circleId,
            async (urls) => {
                replacementOrder.push(`cleanup:${urls.join(",")}`);
                return { status: "complete" };
            },
        );
        assert.deepEqual(replacementSuccess, { status: "complete" });
        assert.deepEqual(replacementOrder, ["persist-new-picture", `cleanup:${oldPicture.url}`]);

        let persistedPicture = oldPicture.url;
        const replacementFailure = await persistCircleThenCleanupMedia(
            async () => {
                persistedPicture = newPicture.url;
            },
            collectReplacedCircleMedia(oldPicture, newPicture),
            circleId,
            async () => ({ status: "failed", error: cleanupError }),
        );
        assert.equal(persistedPicture, newPicture.url, "cleanup failure does not roll back the persisted replacement");
        assert.equal(replacementFailure.status, "failed");

        let persistedCover: string | undefined = oldPicture.url;
        const removalFailure = await persistCircleThenCleanupMedia(
            async () => {
                persistedCover = undefined;
            },
            collectReplacedCircleMedia(oldPicture, undefined),
            circleId,
            async () => ({ status: "failed", error: cleanupError }),
        );
        assert.equal(persistedCover, undefined, "cleanup failure does not roll back persisted removal");
        assert.equal(removalFailure.status, "failed");

        let sourceDeletes = 0;
        assert.deepEqual(
            await cleanupMediaBeforeSourceDelete(
                [oldPicture.url],
                circleId,
                async () => ((sourceDeletes += 1), true),
                async () => ({ status: "complete" }),
            ),
            { status: "success" },
        );
        assert.equal(sourceDeletes, 1);
        assert.equal(
            (
                await cleanupMediaBeforeSourceDelete(
                    [oldPicture.url],
                    circleId,
                    async () => ((sourceDeletes += 1), true),
                    async () => ({ status: "failed", error: cleanupError }),
                )
            ).status,
            "cleanup-failed",
        );
        assert.equal(sourceDeletes, 1, "source deletion is blocked by cleanup failure");

        const partiallyDeleted = [oldPicture.url];
        const partialProposalCleanup = await cleanupMediaBeforeSourceDelete(
            [oldPicture.url, newPicture.url],
            circleId,
            async () => ((sourceDeletes += 1), true),
            async () => {
                partiallyDeleted.push(newPicture.url);
                return { status: "failed", error: cleanupError };
            },
        );
        assert.equal(partialProposalCleanup.status, "cleanup-failed");
        assert.equal(sourceDeletes, 1, "partial media cleanup still preserves the Proposal source");
        assert.equal(partiallyDeleted.length, 2, "already-completed media deletion is not recreated");

        const fundingCase = (noticeboardFails: boolean, cleanupFails: boolean, urls = [oldPicture.url]) => {
            let cleanupCalls = 0;
            return {
                get cleanupCalls() {
                    return cleanupCalls;
                },
                result: completeFundingPostMutation(
                    urls,
                    circleId,
                    async () => {
                        if (noticeboardFails) throw new Error("noticeboard failed");
                    },
                    async () => {
                        cleanupCalls += 1;
                        return cleanupFails ? { status: "failed", error: cleanupError } : { status: "complete" };
                    },
                ),
            };
        };
        const noticeboardOnly = await fundingCase(true, false).result;
        assert.deepEqual(noticeboardOnly, {
            noticeboardSyncFailed: true,
            mediaCleanupFailed: false,
        });
        assert.equal(
            getFundingPostMutationMessage(noticeboardOnly, "Funding request updated."),
            "Funding request updated, but Noticeboard post could not be created.",
        );
        const combinedFailure = await fundingCase(true, true).result;
        assert.deepEqual(combinedFailure, {
            noticeboardSyncFailed: true,
            mediaCleanupFailed: true,
        });
        assert.equal(
            getFundingPostMutationMessage(combinedFailure, "Funding request updated."),
            "The update was saved, but Noticeboard synchronization and old media cleanup did not complete.",
        );
        const cleanupOnly = await fundingCase(false, true).result;
        assert.deepEqual(cleanupOnly, {
            noticeboardSyncFailed: false,
            mediaCleanupFailed: true,
        });
        assert.equal(
            getFundingPostMutationMessage(cleanupOnly, "Funding request updated."),
            "The update was saved, but old media cleanup did not complete.",
        );
        const unchangedFunding = fundingCase(false, false, []);
        const fundingSuccess = await unchangedFunding.result;
        assert.equal(unchangedFunding.cleanupCalls, 0, "unchanged cover performs no cleanup call");
        assert.equal(
            getFundingPostMutationMessage(fundingSuccess, "Funding request updated."),
            "Funding request updated.",
        );

        await assert.rejects(
            createCircle(
                {
                    name: "Blocked Secret",
                    handle: "blocked-secret",
                    circleType: "circle",
                    visibility: "secret",
                    createdBy: "did:actor",
                },
                "did:actor",
            ),
            /Secret Circle creation remains disabled/,
        );

        console.log("circle media storage tests passed");
    } finally {
        if (originalCirclesUrl === undefined) delete process.env.CIRCLES_URL;
        else process.env.CIRCLES_URL = originalCirclesUrl;
        if (originalIsBuild === undefined) delete process.env.IS_BUILD;
        else process.env.IS_BUILD = originalIsBuild;
    }
}

void main();
