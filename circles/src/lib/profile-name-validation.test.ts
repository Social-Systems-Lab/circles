import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error Bun provides its test APIs at runtime.
import { test } from "bun:test";
import {
    personalProfileDisplayNameSchema,
    validatePersonalProfileDisplayName,
    validatePersonalProfileDisplayNameField,
} from "./profile-name-validation";

test("personal profile names reject empty and whitespace-only values", () => {
    for (const name of ["", "   ", "\n\t"]) {
        assert.equal(personalProfileDisplayNameSchema.safeParse(name).success, false);
        assert.deepEqual(validatePersonalProfileDisplayName(name), {
            valid: false,
            message: "Enter your name (2–100 characters).",
        });
        assert.equal(validatePersonalProfileDisplayNameField(name), "Enter your name (2–100 characters).");
    }
});

test("personal profile names accept and normalize valid 2–100 character values", () => {
    assert.equal(personalProfileDisplayNameSchema.parse("  Jo  "), "Jo");
    assert.equal(personalProfileDisplayNameSchema.parse("A".repeat(100)), "A".repeat(100));
    assert.deepEqual(validatePersonalProfileDisplayName("  Jordan  "), { valid: true, name: "Jordan" });
    assert.equal(validatePersonalProfileDisplayNameField("  Jordan  "), true);
    assert.equal(personalProfileDisplayNameSchema.safeParse("A".repeat(101)).success, false);
});

test("the personal profile editor wires validation to the inline field error state", () => {
    const form = readFileSync("src/components/forms/circle-settings/about-settings-form.tsx", "utf8");
    const dynamicField = readFileSync("src/components/forms/dynamic-field.tsx", "utf8");
    const inlineEditor = readFileSync("src/components/modules/home/editable-field.tsx", "utf8");
    const homeContent = readFileSync("src/components/modules/home/home-content.tsx", "utf8");
    const inlineAction = readFileSync("src/components/modules/home/actions.ts", "utf8");
    const settingsAction = readFileSync("src/app/circles/[handle]/settings/about/actions.ts", "utf8");

    assert.match(
        form,
        /rules=\{\{ validate: isUserProfile \? validatePersonalProfileDisplayNameField : undefined \}\}/,
    );
    assert.match(form, /required=\{isUserProfile\}/);
    assert.match(dynamicField, /<FormMessage \/>/);
    assert.match(inlineEditor, /id === "name" && isPersonalProfile/);
    assert.match(inlineEditor, /validatePersonalProfileDisplayName\(editValue\)/);
    assert.ok(
        inlineEditor.indexOf("if (!validation.valid)") < inlineEditor.indexOf("const formData = new FormData()"),
        "invalid inline values are rejected before an action request is created",
    );
    assert.match(inlineEditor, /title: "Name not saved"/);
    assert.match(inlineEditor, /maxLength=\{isPersonalProfile && id === "name" \? 100 : undefined\}/);
    assert.match(homeContent, /isPersonalProfile=\{isUser\}/);
    assert.match(inlineAction, /validatePersonalProfileDisplayName\(personalNameEntries\[0\]\)/);
    assert.match(settingsAction, /validatePersonalProfileDisplayName\(values\.name \?\? ""\)/);
});
