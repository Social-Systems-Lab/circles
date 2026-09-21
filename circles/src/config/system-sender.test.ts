import { describe, expect, test } from "bun:test";
import { getKamooniSystemSender } from "./system-sender";

describe("getKamooniSystemSender", () => {
    test("returns the Kamooni system sender identity", () => {
        expect(getKamooniSystemSender()).toEqual({
            displayName: "Kamooni",
            handle: "kamooni",
            did: "system:kamooni",
            avatarUrl: "/images/kamooni_logo.png",
        });
    });

    test("returns a fresh object on every call", () => {
        expect(getKamooniSystemSender()).not.toBe(getKamooniSystemSender());
    });

    test("isolates callers from each other's mutations", () => {
        const first = getKamooniSystemSender();
        first.displayName = "Tampered";

        expect(getKamooniSystemSender().displayName).toBe("Kamooni");
    });

    test("uses a did that cannot collide with a user did", () => {
        expect(getKamooniSystemSender().did.startsWith("system:")).toBe(true);
    });
});
