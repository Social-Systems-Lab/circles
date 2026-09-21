import { describe, expect, test } from "bun:test";
import { getKamooniSystemSender } from "./system-sender";
import { SYSTEM_MESSAGE_SOURCE_PREFIX, WELCOME_MESSAGE, isSystemMessageSource } from "./welcome-message";

describe("isSystemMessageSource", () => {
    test("recognizes sources that start with the system prefix", () => {
        expect(isSystemMessageSource("system_welcome")).toBe(true);
        expect(isSystemMessageSource("system_anything_else")).toBe(true);
        expect(isSystemMessageSource(SYSTEM_MESSAGE_SOURCE_PREFIX)).toBe(true);
    });

    test("rejects sources without the prefix", () => {
        expect(isSystemMessageSource("user")).toBe(false);
        expect(isSystemMessageSource("welcome_system_")).toBe(false);
        expect(isSystemMessageSource("System_welcome")).toBe(false);
        expect(isSystemMessageSource(" system_welcome")).toBe(false);
        expect(isSystemMessageSource("")).toBe(false);
    });

    test("rejects missing and non-string values", () => {
        expect(isSystemMessageSource(undefined)).toBe(false);
        expect(isSystemMessageSource(null)).toBe(false);
        expect(isSystemMessageSource(5 as unknown as string)).toBe(false);
        expect(isSystemMessageSource({} as unknown as string)).toBe(false);
    });
});

describe("WELCOME_MESSAGE", () => {
    test("is sent by the Kamooni system sender", () => {
        const sender = getKamooniSystemSender();
        expect(WELCOME_MESSAGE.senderHandle).toBe(sender.handle);
        expect(WELCOME_MESSAGE.displayName).toBe(sender.displayName);
        expect(WELCOME_MESSAGE.avatarUrl).toBe(sender.avatarUrl);
    });

    test("is tagged with a system source so it is recognized as a system message", () => {
        expect(WELCOME_MESSAGE.source).toBe("system_welcome");
        expect(isSystemMessageSource(WELCOME_MESSAGE.source)).toBe(true);
    });

    test("has a thread name, version and disabled replies", () => {
        expect(WELCOME_MESSAGE.threadName).toBe("Welcome to Kamooni");
        expect(WELCOME_MESSAGE.version).toBe("v2");
        expect(WELCOME_MESSAGE.repliesDisabled).toBe(true);
    });

    test("starts with a greeting and ends with the team signature", () => {
        expect(WELCOME_MESSAGE.markdown.startsWith("Welcome to Kamooni")).toBe(true);
        expect(WELCOME_MESSAGE.markdown.endsWith("— The Kamooni Team")).toBe(true);
    });

    test("links to the Kamooni circle, issue tracker, proposals and Social Systems Lab", () => {
        const links = [...WELCOME_MESSAGE.markdown.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((match) => match[1]);
        expect(links).toEqual([
            "https://kamooni.org/circles/kamooni",
            "https://kamooni.org/circles/kamooni/issues",
            "https://kamooni.org/circles/kamooni/proposals",
            "https://www.socialsystems.io/",
        ]);
    });
});
