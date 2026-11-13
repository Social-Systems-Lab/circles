import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    globalServerSettingsFormSchema,
    globalServerSettingsValidationSchema,
    preserveOptionalIntegrationKeys,
} from "@/components/modules/admin/global-server-settings-schema";

const requiredSettings = {
    name: "Kamooni Staging",
    url: "https://staging.kamooni.org",
    jwtSecret: "existing-jwt-secret",
};

assert.equal(
    globalServerSettingsValidationSchema.safeParse({
        ...requiredSettings,
        openaiKey: "",
        mapboxKey: "pk.staging-mapbox",
    }).success,
    true,
    "Mapbox settings can be saved without an OpenAI key",
);

assert.equal(
    globalServerSettingsValidationSchema.safeParse({
        ...requiredSettings,
        openaiKey: "sk-staging-openai",
        mapboxKey: "",
    }).success,
    true,
    "OpenAI settings can be saved without a Mapbox key",
);

assert.equal(
    globalServerSettingsValidationSchema.safeParse({
        ...requiredSettings,
        openaiKey: "",
        mapboxKey: "",
    }).success,
    true,
    "both optional integrations may be disabled",
);

for (const [field, invalidValue] of [
    ["name", ""],
    ["url", "not-a-url"],
    ["jwtSecret", ""],
] as const) {
    const result = globalServerSettingsValidationSchema.safeParse({
        ...requiredSettings,
        openaiKey: "",
        mapboxKey: "",
        [field]: invalidValue,
    });
    assert.equal(result.success, false, `${field} remains required`);
    if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.path.join(".") === field));
    }
}

for (const field of ["openaiKey", "mapboxKey"] as const) {
    assert.equal(
        globalServerSettingsFormSchema.fields.find((item) => item.name === field)?.required,
        false,
        `${field} is marked optional in form metadata`,
    );
}

assert.deepEqual(
    preserveOptionalIntegrationKeys(
        {
            ...requiredSettings,
            openaiKey: "",
            mapboxKey: "pk.replacement",
        },
        {
            openaiKey: "sk.existing",
            mapboxKey: "pk.existing",
        },
    ),
    {
        ...requiredSettings,
        openaiKey: "sk.existing",
        mapboxKey: "pk.replacement",
    },
    "blank optional submissions preserve the existing credential",
);

const action = readFileSync("src/components/modules/admin/actions.ts", "utf8");
const form = readFileSync("src/components/modules/admin/global-server-settings-form.tsx", "utf8");
assert.match(action, /globalServerSettingsValidationSchema\.safeParse\(data\)/);
assert.match(action, /preserveOptionalIntegrationKeys\(validatedData, currentSettings\)/);
assert.match(form, /resolver: zodResolver\(globalServerSettingsValidationSchema\)/);

console.log("global server settings validation tests passed");
