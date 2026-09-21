import assert from "node:assert/strict";
import {
    assertCanonicalUserHandle,
    assertCanonicalUserHandleChange,
    isCanonicalUserHandle,
} from "./canonical-user-handle";

for (const handle of ["abc", "maji-c-all", "user123", "a1-b2", "abcdefghijklmnopqrst"]) {
    assert.equal(isCanonicalUserHandle(handle), true, `${handle} is canonical`);
    assert.doesNotThrow(() => assertCanonicalUserHandle(handle));
}

for (const handle of [
    "",
    "ab",
    "abcdefghijklmnopqrstu",
    " maji-c-all",
    "maji-c-all ",
    "maji c all",
    "Maji-c-all",
    "-maji",
    "maji-",
    "maji--all",
    "maji_all",
    "maji.all",
    "...",
    undefined,
    null,
    123,
]) {
    assert.equal(isCanonicalUserHandle(handle), false, `${String(handle)} is rejected`);
    assert.throws(() => assertCanonicalUserHandle(handle), /Handle must be 3-20 characters/);
}

for (const historicalHandle of ["Tall-Tim", "linsey-", "GH", "..."]) {
    assert.doesNotThrow(
        () => assertCanonicalUserHandleChange(historicalHandle, historicalHandle),
        `unchanged historical handle ${historicalHandle} remains compatible`,
    );
}

assert.doesNotThrow(() => assertCanonicalUserHandleChange("Tall-Tim", "tall-tim"));
assert.throws(() => assertCanonicalUserHandleChange("Tall-Tim", "new handle"), /Handle must be 3-20 characters/);
assert.throws(() => assertCanonicalUserHandleChange("linsey-", "linsey-2-"), /Handle must be 3-20 characters/);

console.log("canonical user handle tests passed");
