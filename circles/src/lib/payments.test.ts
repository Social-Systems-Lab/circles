import assert from "node:assert/strict";
import test from "node:test";
import { arePaymentsEnabled, assertDonorboxCredentialsConfigured, assertPaymentsEnabled } from "@/lib/payments";

test("only exact PAYMENTS_ENABLED=false disables payments", () => {
    assert.equal(arePaymentsEnabled(undefined), true, "an undefined value preserves production behavior");
    for (const value of [
        "",
        "true",
        "True",
        "False",
        "FALSE",
        "0",
        "1",
        "disabled",
        "enabled",
        "yes",
        " false ",
        "legacy-value",
    ] as const) {
        assert.equal(arePaymentsEnabled(value), true, `${JSON.stringify(value)} preserves production behavior`);
    }
    assert.equal(arePaymentsEnabled("false"), false, "exact lowercase false disables payments");

    const original = process.env.PAYMENTS_ENABLED;
    try {
        delete process.env.PAYMENTS_ENABLED;
        assert.doesNotThrow(assertPaymentsEnabled, "an absent variable preserves production behavior");
        for (const value of [
            "",
            "true",
            "True",
            "False",
            "FALSE",
            "0",
            "1",
            "disabled",
            "enabled",
            "yes",
            " false ",
            "legacy-value",
        ] as const) {
            process.env.PAYMENTS_ENABLED = value;
            assert.doesNotThrow(assertPaymentsEnabled);
        }
        process.env.PAYMENTS_ENABLED = "false";
        assert.throws(assertPaymentsEnabled, /Payments are disabled/);
    } finally {
        if (original === undefined) delete process.env.PAYMENTS_ENABLED;
        else process.env.PAYMENTS_ENABLED = original;
    }
});

test("Donorbox calls fail closed when credentials are empty", () => {
    assert.throws(() => assertDonorboxCredentialsConfigured("", "key"), /not configured/);
    assert.throws(() => assertDonorboxCredentialsConfigured("user", ""), /not configured/);
    assert.doesNotThrow(() => assertDonorboxCredentialsConfigured("user", "key"));
});
