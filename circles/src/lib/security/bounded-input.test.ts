import assert from "node:assert/strict";
import { z } from "zod";
import { circleSchema } from "@/models/models";
import { boundedSafeParse, inspectFormDataBounds, inspectInputBounds, readJsonBodyLimited } from "./bounded-input";

async function main() {
    let elementValidationRuns = 0;
    const invalidElementSchema = z.array(
        z.string().refine(() => {
            elementValidationRuns += 1;
            return false;
        }),
    );
    const oversized = boundedSafeParse(
        invalidElementSchema,
        Array.from({ length: 501 }, () => 42),
    );
    assert.equal(oversized.success, false);
    assert.equal(elementValidationRuns, 0, "preflight rejects before Zod visits attacker-controlled array elements");
    if (!oversized.success) assert.equal(oversized.error.issues.length, 1);

    assert.ok(inspectInputBounds({ nested: { values: Array.from({ length: 501 }, () => ({ bad: true })) } }));
    assert.ok(inspectInputBounds({ text: "x".repeat(100_001) }));
    assert.ok(
        inspectInputBounds(
            { nested: { deeper: { value: 1 } } },
            {
                maxArrayItems: 100,
                maxObjectFields: 200,
                maxDepth: 1,
                maxValues: 10_000,
                maxStringLength: 100_000,
            },
        ),
    );

    const validAtLimit = boundedSafeParse(
        z.array(z.number()).max(500),
        Array.from({ length: 500 }, (_, index) => index),
    );
    assert.equal(validAtLimit.success, true, "valid submissions at the configured selection limit remain accepted");

    const rankedIds = new FormData();
    for (let index = 0; index < 10_000; index += 1) rankedIds.append("rankedItemIds", `id-${index}`);
    assert.equal(inspectFormDataBounds(rankedIds), null, "bounded large ranking lists remain accepted");

    const formData = new FormData();
    for (let index = 0; index < 21; index += 1) formData.append("images", new Blob(["fixture"]), `image-${index}.png`);
    assert.ok(
        inspectFormDataBounds(formData),
        "image uploads reject excessive file counts before getAll/schema validation",
    );
    const allowedImages = new FormData();
    for (let index = 0; index < 20; index += 1)
        allowedImages.append("images", new Blob(["fixture"]), `image-${index}.png`);
    assert.equal(inspectFormDataBounds(allowedImages), null, "the established 20-file upload limit is accepted");

    const tooLargeJson = new Request("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ value: "x".repeat(64) }),
        headers: { "content-type": "application/json" },
    });
    const oversizedBody = await readJsonBodyLimited(tooLargeJson, 32);
    assert.deepEqual(oversizedBody, { ok: false, status: 413, error: "Request body too large" });

    const validJson = new Request("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ circleId: "test-circle" }),
        headers: { "content-type": "application/json" },
    });
    assert.deepEqual(await readJsonBodyLimited(validJson, 128), { ok: true, value: { circleId: "test-circle" } });

    // The guard is applied only to request inputs; persisted schemas retain their existing array policy.
    const legacyCircle = circleSchema.safeParse({
        userGroups: Array.from({ length: 101 }, (_, index) => ({
            name: `Legacy group ${index}`,
            handle: `legacy-${index}`,
            title: `Legacy ${index}`,
            description: "Existing group retained",
            accessLevel: 0,
        })),
    });
    assert.equal(legacyCircle.success, true, "historical profile data above request limits remains schema-compatible");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
