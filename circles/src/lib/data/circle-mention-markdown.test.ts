import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import {
    canonicalCircleMarkdown,
    classifyCircleReference,
    escapeCircleMarkdownLabel,
    findCompleteMarkdownLinkOccurrences,
    hasIncompleteCircleReferenceAttempt,
    isMarkdownDelimiterEscaped,
    parseCircleReferenceOccurrences,
} from "./circle-mention-markdown";

const OBJECT_ID = "507f1f77bcf86cd799439011";

describe("isMarkdownDelimiterEscaped", () => {
    test("is false without a preceding backslash", () => {
        expect(isMarkdownDelimiterEscaped("[a]", 0)).toBe(false);
        expect(isMarkdownDelimiterEscaped("x[a]", 1)).toBe(false);
    });

    test("is true after an odd number of backslashes", () => {
        expect(isMarkdownDelimiterEscaped("\\[", 1)).toBe(true);
        expect(isMarkdownDelimiterEscaped("\\\\\\[", 3)).toBe(true);
    });

    test("is false after an even number of backslashes, which escape each other", () => {
        expect(isMarkdownDelimiterEscaped("\\\\[", 2)).toBe(false);
        expect(isMarkdownDelimiterEscaped("\\\\\\\\[", 4)).toBe(false);
    });

    test("only counts backslashes directly before the index", () => {
        expect(isMarkdownDelimiterEscaped("\\ [", 2)).toBe(false);
    });

    test("is false at the start of the string", () => {
        expect(isMarkdownDelimiterEscaped("\\", 0)).toBe(false);
    });
});

describe("findCompleteMarkdownLinkOccurrences", () => {
    test("finds a simple link with its range and destination", () => {
        expect(findCompleteMarkdownLinkOccurrences("[label](/circles/x)")).toEqual([
            { start: 0, end: 19, target: "/circles/x" },
        ]);
    });

    test("finds links surrounded by text", () => {
        const content = "hi [a](/one) and [b](/two)!";

        const links = findCompleteMarkdownLinkOccurrences(content);

        expect(links.map((link) => link.target)).toEqual(["/one", "/two"]);
        expect(links.map((link) => content.slice(link.start, link.end))).toEqual(["[a](/one)", "[b](/two)"]);
    });

    test("returns nothing for text without links", () => {
        expect(findCompleteMarkdownLinkOccurrences("")).toEqual([]);
        expect(findCompleteMarkdownLinkOccurrences("just text (with) [brackets]")).toEqual([]);
    });

    test("requires the destination to follow the label immediately", () => {
        expect(findCompleteMarkdownLinkOccurrences("[a] (/x)")).toEqual([]);
    });

    test("ignores links whose opening bracket is escaped", () => {
        expect(findCompleteMarkdownLinkOccurrences("\\[a](/x)")).toEqual([]);
    });

    test("treats a doubled backslash before the bracket as a literal backslash", () => {
        expect(findCompleteMarkdownLinkOccurrences("\\\\[a](/x)")).toEqual([{ start: 2, end: 9, target: "/x" }]);
    });

    test("ignores image links", () => {
        expect(findCompleteMarkdownLinkOccurrences("![alt](/circles/x)")).toEqual([]);
    });

    test("treats an escaped exclamation mark as ordinary text", () => {
        expect(findCompleteMarkdownLinkOccurrences("\\![a](/x)")).toEqual([{ start: 2, end: 9, target: "/x" }]);
    });

    test("does not end a label at an escaped closing bracket", () => {
        expect(findCompleteMarkdownLinkOccurrences("[a\\]b](/x)")).toEqual([{ start: 0, end: 10, target: "/x" }]);
    });

    test("does not end a destination at an escaped parenthesis", () => {
        expect(findCompleteMarkdownLinkOccurrences("[a](/x\\)y)")).toEqual([{ start: 0, end: 10, target: "/x\\)y" }]);
    });

    test("ends a destination at the first unescaped closing parenthesis", () => {
        expect(findCompleteMarkdownLinkOccurrences("[a](/x)y)")).toEqual([{ start: 0, end: 7, target: "/x" }]);
    });

    test("does not span line breaks in the label or destination", () => {
        expect(findCompleteMarkdownLinkOccurrences("[a\nb](/x)")).toEqual([]);
        expect(findCompleteMarkdownLinkOccurrences("[a\r\nb](/x)")).toEqual([]);
        expect(findCompleteMarkdownLinkOccurrences("[a](/x\ny)")).toEqual([]);
    });

    test("ignores a link that is never closed", () => {
        expect(findCompleteMarkdownLinkOccurrences("[a](/circles/x")).toEqual([]);
        expect(findCompleteMarkdownLinkOccurrences("[a")).toEqual([]);
    });

    test("supports angle bracket destinations and strips the brackets", () => {
        expect(findCompleteMarkdownLinkOccurrences("[a](</circles/x y>)")).toEqual([
            { start: 0, end: 19, target: "/circles/x y" },
        ]);
    });

    test("ignores an angle bracket destination that is not closed properly", () => {
        expect(findCompleteMarkdownLinkOccurrences("[a](</circles/x)")).toEqual([]);
        expect(findCompleteMarkdownLinkOccurrences("[a](</circles/x>")).toEqual([]);
        expect(findCompleteMarkdownLinkOccurrences("[a](</circles/x>y)")).toEqual([]);
    });

    test("allows empty labels and empty destinations", () => {
        expect(findCompleteMarkdownLinkOccurrences("[](/x)")).toEqual([{ start: 0, end: 6, target: "/x" }]);
        expect(findCompleteMarkdownLinkOccurrences("[a]()")).toEqual([{ start: 0, end: 5, target: "" }]);
    });

    test("does not rescan the inside of a matched link", () => {
        expect(findCompleteMarkdownLinkOccurrences("[a](/x[b](/y))")).toEqual([{ start: 0, end: 13, target: "/x[b](/y" }]);
    });

    test("treats a nested opening bracket as part of the label", () => {
        expect(findCompleteMarkdownLinkOccurrences("[[a](/x)")).toEqual([{ start: 0, end: 8, target: "/x" }]);
    });

    test("keeps parenthesis pairs inside a destination out of scope, ending at the first closer", () => {
        expect(findCompleteMarkdownLinkOccurrences("[a](/x(y))")).toEqual([{ start: 0, end: 9, target: "/x(y" }]);
    });
});

describe("classifyCircleReference", () => {
    test("returns null for targets that are not circle routes", () => {
        for (const target of ["", "/circle/x", "circles/x", "https://kamooni.org/circles/x", "/other/x", "/Circles/x"]) {
            expect(classifyCircleReference(target)).toBeNull();
        }
    });

    test("classifies a handle", () => {
        expect(classifyCircleReference("/circles/my-circle")).toEqual({ identifier: "my-circle", handle: "my-circle" });
    });

    test("classifies an ObjectId and normalizes it", () => {
        expect(classifyCircleReference(`/circles/${OBJECT_ID}`)).toEqual({ identifier: OBJECT_ID, objectId: OBJECT_ID });
        expect(classifyCircleReference(`/circles/${OBJECT_ID.toUpperCase()}`)).toEqual({
            identifier: OBJECT_ID.toUpperCase(),
            objectId: OBJECT_ID,
        });
    });

    test("does not give an ObjectId a handle, or a handle an ObjectId", () => {
        expect(classifyCircleReference(`/circles/${OBJECT_ID}`)).not.toHaveProperty("handle");
        expect(classifyCircleReference("/circles/abc")).not.toHaveProperty("objectId");
    });

    test("decodes percent-encoded identifiers", () => {
        expect(classifyCircleReference("/circles/caf%C3%A9")).toEqual({ identifier: "café", handle: "café" });
    });

    test.each([
        ["an empty identifier", "/circles/"],
        ["extra path segments", "/circles/a/b"],
        ["a trailing slash", "/circles/a/"],
        ["a query string", "/circles/a?x=1"],
        ["a fragment", "/circles/a#top"],
        ["whitespace", "/circles/a b"],
        ["a trailing space", "/circles/a "],
    ])("marks %s as an unusable identifier", (_label, target) => {
        expect(classifyCircleReference(target)).toEqual({ identifier: null });
    });

    test("marks an identifier that only becomes unsafe after decoding as unusable", () => {
        expect(classifyCircleReference("/circles/a%2Fb")).toEqual({ identifier: null });
        expect(classifyCircleReference("/circles/a%3Fb")).toEqual({ identifier: null });
        expect(classifyCircleReference("/circles/a%23b")).toEqual({ identifier: null });
        expect(classifyCircleReference("/circles/a%20b")).toEqual({ identifier: null });
        expect(classifyCircleReference("/circles/a%0Ab")).toEqual({ identifier: null });
    });

    test("marks malformed percent encoding as unusable", () => {
        expect(classifyCircleReference("/circles/%E0%A4%A")).toEqual({ identifier: null });
        expect(classifyCircleReference("/circles/100%")).toEqual({ identifier: null });
    });

    test("marks an identifier that decodes to nothing as unusable", () => {
        expect(classifyCircleReference("/circles/%")).toEqual({ identifier: null });
    });
});

describe("parseCircleReferenceOccurrences", () => {
    test("returns circle links with their position and classification", () => {
        expect(parseCircleReferenceOccurrences("hi [Anna](/circles/anna)")).toEqual([
            { start: 3, end: 24, target: "/circles/anna", identifier: "anna", handle: "anna" },
        ]);
    });

    test("skips links that are not circle routes", () => {
        expect(parseCircleReferenceOccurrences("[a](https://example.com) [b](/circles/b)")).toEqual([
            { start: 25, end: 40, target: "/circles/b", identifier: "b", handle: "b" },
        ]);
    });

    test("keeps circle links with unusable identifiers so callers can reject them", () => {
        expect(parseCircleReferenceOccurrences("[a](/circles/a/b)")).toEqual([
            { start: 0, end: 17, target: "/circles/a/b", identifier: null },
        ]);
    });

    test("returns ids and handles in document order", () => {
        const occurrences = parseCircleReferenceOccurrences(`[a](/circles/${OBJECT_ID}) [b](/circles/b)`);

        expect(occurrences.map((o) => o.objectId ?? o.handle)).toEqual([OBJECT_ID, "b"]);
    });

    test("returns nothing for plain text, escaped links and images", () => {
        expect(parseCircleReferenceOccurrences("hello")).toEqual([]);
        expect(parseCircleReferenceOccurrences("\\[a](/circles/a)")).toEqual([]);
        expect(parseCircleReferenceOccurrences("![a](/circles/a)")).toEqual([]);
    });
});

describe("hasIncompleteCircleReferenceAttempt", () => {
    test("is false for text without link syntax", () => {
        expect(hasIncompleteCircleReferenceAttempt("")).toBe(false);
        expect(hasIncompleteCircleReferenceAttempt("plain text")).toBe(false);
    });

    test("is false for a complete circle link", () => {
        expect(hasIncompleteCircleReferenceAttempt("[a](/circles/a)")).toBe(false);
        expect(hasIncompleteCircleReferenceAttempt("[a](</circles/a>)")).toBe(false);
    });

    test("is true for a circle link whose destination is never closed", () => {
        expect(hasIncompleteCircleReferenceAttempt("[a](/circles/a")).toBe(true);
        expect(hasIncompleteCircleReferenceAttempt("see [a](/circles/a and more")).toBe(true);
    });

    test("is true when the closing parenthesis is on another line", () => {
        expect(hasIncompleteCircleReferenceAttempt("[a](/circles/a\n)")).toBe(true);
    });

    test("is true for an angle bracket destination that is not closed properly", () => {
        expect(hasIncompleteCircleReferenceAttempt("[a](</circles/a")).toBe(true);
        expect(hasIncompleteCircleReferenceAttempt("[a](</circles/a>")).toBe(true);
        expect(hasIncompleteCircleReferenceAttempt("[a](</circles/a>x)")).toBe(true);
    });

    test("is false for incomplete links to other destinations", () => {
        expect(hasIncompleteCircleReferenceAttempt("[a](https://example.com")).toBe(false);
        expect(hasIncompleteCircleReferenceAttempt("[a](/other/a")).toBe(false);
        expect(hasIncompleteCircleReferenceAttempt("[a](</other/a")).toBe(false);
    });

    test("is false for escaped brackets and images", () => {
        expect(hasIncompleteCircleReferenceAttempt("\\[a](/circles/a")).toBe(false);
        expect(hasIncompleteCircleReferenceAttempt("![a](/circles/a")).toBe(false);
    });

    test("is true when an escaped exclamation mark precedes a real link attempt", () => {
        expect(hasIncompleteCircleReferenceAttempt("\\![a](/circles/a")).toBe(true);
    });

    test("finds an incomplete attempt after a complete link", () => {
        expect(hasIncompleteCircleReferenceAttempt("[ok](/circles/ok) [bad](/circles/bad")).toBe(true);
    });

    test("is false when the label is never closed", () => {
        expect(hasIncompleteCircleReferenceAttempt("[a (/circles/a")).toBe(false);
    });
});

describe("escapeCircleMarkdownLabel", () => {
    test("escapes backslashes and square brackets", () => {
        expect(escapeCircleMarkdownLabel("a[b]c\\d")).toBe("a\\[b\\]c\\\\d");
    });

    test("leaves other characters alone", () => {
        expect(escapeCircleMarkdownLabel("Plain (name) *bold* _x_ <tag>")).toBe("Plain (name) *bold* _x_ <tag>");
        expect(escapeCircleMarkdownLabel("")).toBe("");
    });

    test("escapes every occurrence", () => {
        expect(escapeCircleMarkdownLabel("[[]]")).toBe("\\[\\[\\]\\]");
    });
});

describe("canonicalCircleMarkdown", () => {
    test("builds a link to the circle handle", () => {
        expect(canonicalCircleMarkdown({ name: "Anna S.", handle: "anna" })).toBe("[Anna S.](/circles/anna)");
    });

    test("escapes the name so it cannot break out of the label", () => {
        expect(canonicalCircleMarkdown({ name: "x](/circles/evil) [y", handle: "anna" })).toBe(
            "[x\\](/circles/evil) \\[y](/circles/anna)",
        );
    });

    test("round-trips through the parser to the same handle", () => {
        const markdown = canonicalCircleMarkdown({ name: "Weird [name]", handle: "weird" });

        expect(parseCircleReferenceOccurrences(markdown)).toEqual([
            { start: 0, end: markdown.length, target: "/circles/weird", identifier: "weird", handle: "weird" },
        ]);
    });

    test("does not validate or encode the handle", () => {
        expect(canonicalCircleMarkdown({ name: "n", handle: "a b" })).toBe("[n](/circles/a b)");
    });

    test("produces something the parser recognizes as an ObjectId reference when the handle is an id", () => {
        const id = new ObjectId().toHexString();

        expect(parseCircleReferenceOccurrences(canonicalCircleMarkdown({ name: "n", handle: id }))[0].objectId).toBe(id);
    });
});
