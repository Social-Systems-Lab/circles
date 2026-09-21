import { describe, expect, test } from "bun:test";
import { v5 as uuidv5 } from "uuid";
import { CIRCLE_VECTOR_NAMESPACE, getCircleVectorPointId } from "./circle-vector-publication";
import { getDerivedVectorPointId } from "./derived-vector-publication";

// Qdrant point ids are uuid v5 digests of a resource id under a fixed namespace, and they are stored
// in Qdrant. If the uuid package ever changed what v5 produces, every existing vector would be
// orphaned and re-indexing would silently duplicate instead of update. These literals were generated
// with uuid@10.0.0 and must not change across upgrades.
const SAMPLES: string[] = ["507f1f77bcf86cd799439011", "circle-1", "", "no-poverty", "Ünïcødé-håndle"];

const NAMESPACES = {
    circle: "374c3b2f-be54-5c82-b3a1-f16f7b205cdc",
    posts: "425f7857-1b1b-5ddc-b797-bd12ff00023c",
    events: "4f2a8b6b-8d93-5e8c-bc7e-6a0c2c87c1e0",
    proposals: "8f991a54-2e03-5ffc-bf0f-5e7b2b92fcd1",
    tasks: "d3e15cc7-6df2-5102-9a3b-1b4b4b9af6e2",
    issues: "b4b1f58e-9b0f-53b0-9f1a-928e4fc27d8e",
    goals: "c6bfe6f5-6a6a-5ef6-95e9-7c8ba57a8e21",
    // vdb.ts keeps these two private, so they are repeated here.
    sdg: "2fb0c076-39d6-5c9b-b98d-24409f4ebfbc",
    skill: "e8b887ec-5e3d-5383-9565-7fc72bb0e251",
} as const;

const EXPECTED: Record<keyof typeof NAMESPACES, Record<string, string>> = {
    circle: {
        "507f1f77bcf86cd799439011": "eeb0de0f-2bcf-5d94-b77c-8cd3e0d78920",
        "circle-1": "0e41838a-fb59-50e7-a8ad-222a8d93c27c",
        "": "5a8e5f52-3162-5aa6-8a0f-d1069b19d9ea",
        "no-poverty": "774fe5ae-9ce3-5a37-940d-8991e3cd0e5d",
        "Ünïcødé-håndle": "a0b64fe4-2456-590d-b817-994e14e5a11f",
    },
    posts: {
        "507f1f77bcf86cd799439011": "e27f6b19-5782-50ff-bc2d-1f873412a31a",
        "circle-1": "f7b558f0-f5b6-5c94-a8bb-bf715658166e",
        "": "cea98a25-a195-5043-8be9-9f97a02cbc9d",
        "no-poverty": "b4869415-87fe-5c63-a19a-ce86ee5b56e5",
        "Ünïcødé-håndle": "821425a5-95e1-5dc8-9c13-60d26baf24b6",
    },
    events: {
        "507f1f77bcf86cd799439011": "c38ca779-5e15-5295-b76a-273cdb1acfb1",
        "circle-1": "29789e50-345e-59be-9327-26c960f57a50",
        "": "7a9aa0d1-29a0-5f6b-80b4-db8cbf4184a2",
        "no-poverty": "14bf2b20-a49b-51ab-98d8-7bbaf816ed9e",
        "Ünïcødé-håndle": "c4f63219-1707-512a-a7b2-e81f2095801d",
    },
    proposals: {
        "507f1f77bcf86cd799439011": "0e57fe61-1377-5ea4-b73b-420d9d5c9d1b",
        "circle-1": "9d95cf4c-5dc5-5f60-b129-78cb3d8a3323",
        "": "4c9a4ada-0c35-5bea-b8a8-8207d54d6437",
        "no-poverty": "c97ef431-cb62-5d35-9c0c-8ad6bc7b5b70",
        "Ünïcødé-håndle": "9d292c66-5865-5372-b917-c7a28b463c87",
    },
    tasks: {
        "507f1f77bcf86cd799439011": "38fb94f9-c1ec-5fdc-82a2-3c269e64c6a6",
        "circle-1": "aa136c27-c5a2-5c11-9632-c0344ac5abe6",
        "": "eabe7440-b62a-5850-b7c1-1cfb88d00a45",
        "no-poverty": "4f7ba59e-a357-5cfc-9213-ea6013a7e9cf",
        "Ünïcødé-håndle": "a18f8c53-32fc-5559-aa32-f65051b68703",
    },
    issues: {
        "507f1f77bcf86cd799439011": "1fc7e01f-62cf-5ae5-8860-0f56ca923d0d",
        "circle-1": "730199ca-8bc3-5914-8415-98d0d468c2ff",
        "": "cf2c19e2-d41b-5f9e-843d-4f78fefb19ee",
        "no-poverty": "7bfb67d1-4957-5c28-9892-30ca252a2c18",
        "Ünïcødé-håndle": "f81dd7d0-3971-5d15-9816-bf7ea5af66ed",
    },
    goals: {
        "507f1f77bcf86cd799439011": "33f2d875-d52b-5947-92d8-0c1a3ba2e6c7",
        "circle-1": "7462ff6e-bd67-5121-93d4-9d59f64162dc",
        "": "a2147043-f013-5cc0-a0a3-5da387a5b511",
        "no-poverty": "34b98923-3acc-5b07-9617-97c7e14fd58e",
        "Ünïcødé-håndle": "90abba5d-eb30-5cb2-9e59-99cd0b3ff733",
    },
    sdg: {
        "507f1f77bcf86cd799439011": "d77d56fb-4593-51e6-b848-ec390c3a162a",
        "circle-1": "7839a702-5a2a-5269-b022-b3938f2d34ef",
        "": "4cad7de2-e102-5f4e-837a-f79f75634fbb",
        "no-poverty": "dbeb3f25-2c41-54cb-b6dc-135020e37cac",
        "Ünïcødé-håndle": "da09b509-6a0c-5655-8f02-0d8babbf8f94",
    },
    skill: {
        "507f1f77bcf86cd799439011": "89fb2617-5d10-54ff-a21b-b433d5196e6e",
        "circle-1": "4594b396-db91-51e0-afd5-ec8c621b7e1a",
        "": "bdd3a6c7-c1ee-5176-8522-1ce8dac2d2a0",
        "no-poverty": "6c057dbb-d270-5519-8aed-fbda50dd860a",
        "Ünïcødé-håndle": "1dc43080-3480-53a5-a390-d9b069cd7479",
    },
};

describe("uuid v5 digests behind Qdrant point ids", () => {
    for (const [key, namespace] of Object.entries(NAMESPACES) as Array<
        [keyof typeof NAMESPACES, string]
    >) {
        test.each(SAMPLES)(`${key}: %p keeps its digest`, (input: string) => {
            expect(uuidv5(input, namespace)).toBe(EXPECTED[key][input]);
        });
    }
});

describe("point id helpers", () => {
    test("the circle namespace constant is the one the digests were generated for", () => {
        expect(CIRCLE_VECTOR_NAMESPACE).toBe(NAMESPACES.circle);
    });

    test.each(SAMPLES)("getCircleVectorPointId(%p) matches the raw digest", (circleId: string) => {
        expect(getCircleVectorPointId(circleId)).toBe(EXPECTED.circle[circleId]);
    });

    test.each(["posts", "events", "proposals", "tasks", "issues", "goals"] as const)(
        "getDerivedVectorPointId uses the %p namespace",
        (kind) => {
            expect(getDerivedVectorPointId(kind, "circle-1")).toBe(EXPECTED[kind]["circle-1"]);
        },
    );
});
