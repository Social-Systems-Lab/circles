import { describe, expect, test } from "bun:test";
import { useFakeNow } from "@/test/hooks";
import type { Circle, Content, Location } from "@/models/models";
import {
    cn,
    filterLocations,
    generateSlug,
    getDateLong,
    getFullLocationName,
    getPublishTime,
    getUserLocation,
    haversineKm,
    isToday,
    removeLast,
    safeModifyAccessRules,
    safeModifyArray,
    safeModifyMemberUserGroups,
    timeSince,
    truncateText,
} from "./utils";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);
const secondsFromNow = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

describe("cn", () => {
    test("joins class names and skips falsy values", () => {
        expect(cn("a", false, null, undefined, "b")).toBe("a b");
    });

    test("supports conditional object and array syntax", () => {
        expect(cn(["a", { b: true, c: false }])).toBe("a b");
    });

    test("lets the last conflicting tailwind utility win", () => {
        expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    });

    test("returns an empty string when given nothing", () => {
        expect(cn()).toBe("");
    });
});

describe("generateSlug", () => {
    test("lowercases and hyphenates words", () => {
        expect(generateSlug("Hello World")).toBe("hello-world");
    });

    test("strips special characters", () => {
        expect(generateSlug("Hello, World! (2026)")).toBe("hello-world-2026");
    });

    test("collapses runs of whitespace and hyphens", () => {
        expect(generateSlug("a   b---c")).toBe("a-b-c");
    });

    test("keeps underscores and digits", () => {
        expect(generateSlug("snake_case 42")).toBe("snake_case-42");
    });

    test("does not trim leading/trailing hyphens produced by whitespace", () => {
        expect(generateSlug("  padded  ")).toBe("-padded-");
    });

    test("returns an empty string for input without word characters", () => {
        expect(generateSlug("!!!")).toBe("");
        expect(generateSlug("")).toBe("");
    });

    test("strips non-latin letters because \\w is ASCII-only", () => {
        expect(generateSlug("Café Ñandú")).toBe("caf-and");
    });
});

describe("safeModifyArray", () => {
    type Item = { handle: string; readOnly?: boolean; label?: string };

    test("returns the submitted array when there is no existing array", () => {
        const submitted: Item[] = [{ handle: "a" }];
        expect(safeModifyArray(undefined as never, submitted)).toBe(submitted);
    });

    test("returns the existing array when there is no submitted array", () => {
        const existing: Item[] = [{ handle: "a" }];
        expect(safeModifyArray(existing, undefined as never)).toBe(existing);
    });

    test("uses submitted items when nothing is read-only", () => {
        const result = safeModifyArray<Item>([{ handle: "a" }, { handle: "b" }], [{ handle: "c" }]);
        expect(result).toEqual([{ handle: "c" }]);
    });

    test("re-adds a read-only existing item that the submission dropped, at the front", () => {
        const result = safeModifyArray<Item>(
            [{ handle: "locked", readOnly: true }],
            [{ handle: "x" }, { handle: "y" }],
        );
        expect(result.map((item) => item.handle)).toEqual(["locked", "x", "y"]);
    });

    test("overwrites a submitted item that shadows a read-only existing item, keeping its position", () => {
        const locked: Item = { handle: "locked", readOnly: true, label: "original" };
        const result = safeModifyArray<Item>([locked], [{ handle: "x" }, { handle: "locked", label: "tampered" }]);
        expect(result).toEqual([{ handle: "x" }, locked]);
        expect(result[1]).toBe(locked);
    });

    test("does not force non-read-only existing items back in", () => {
        const result = safeModifyArray<Item>([{ handle: "a" }], []);
        expect(result).toEqual([]);
    });

    test("prepends multiple dropped read-only items in reverse existing order", () => {
        const result = safeModifyArray<Item>(
            [
                { handle: "l1", readOnly: true },
                { handle: "l2", readOnly: true },
            ],
            [{ handle: "x" }],
        );
        expect(result.map((item) => item.handle)).toEqual(["l2", "l1", "x"]);
    });
});

describe("removeLast", () => {
    test("removes the pattern when it is the suffix", () => {
        expect(removeLast("foo/bar/", "/")).toBe("foo/bar");
    });

    test("removes only the trailing occurrence", () => {
        expect(removeLast("a-b-b", "-b")).toBe("a-b");
    });

    test("leaves the string alone when the pattern occurs but not at the end", () => {
        expect(removeLast("a-b-c", "-b")).toBe("a-b-c");
    });

    test("leaves the string alone when the pattern is absent", () => {
        expect(removeLast("abc", "x")).toBe("abc");
    });

    test("removes everything when the string equals the pattern", () => {
        expect(removeLast("abc", "abc")).toBe("");
    });

    test("treats the empty pattern as a match at the end of the string", () => {
        expect(removeLast("abc", "")).toBe("abc");
    });
});

describe("safeModifyAccessRules", () => {
    const existing = () => ({ settings_edit: ["admins"], feed_view: ["everyone"] });

    test("throws when the existing rules are missing", () => {
        expect(() => safeModifyAccessRules(undefined, { settings_edit: ["admins"] })).toThrow(
            "Existing rules must be provided",
        );
    });

    test("returns the existing rules by reference when nothing is submitted", () => {
        const rules = existing();
        expect(safeModifyAccessRules(rules, undefined)).toBe(rules);
    });

    test("overrides existing features with the submitted values", () => {
        const result = safeModifyAccessRules(existing(), { feed_view: ["members"] });
        expect(result).toEqual({ settings_edit: ["admins"], feed_view: ["members"] });
    });

    test("includes newly submitted features", () => {
        const result = safeModifyAccessRules(existing(), { brand_new: ["members"] });
        expect(result).toEqual({ settings_edit: ["admins"], feed_view: ["everyone"], brand_new: ["members"] });
    });

    test("does not mutate its inputs", () => {
        const current = existing();
        safeModifyAccessRules(current, { feed_view: ["members"] });
        expect(current).toEqual(existing());
    });

    test("throws when the submission removes admins from settings_edit", () => {
        expect(() => safeModifyAccessRules(existing(), { settings_edit: ["members"] })).toThrow(
            "Admins must have access to edit settings",
        );
    });

    test("throws when settings_edit is absent from both existing and submitted rules", () => {
        expect(() => safeModifyAccessRules({ feed_view: ["everyone"] }, { feed_view: ["members"] })).toThrow(
            "Admins must have access to edit settings",
        );
    });

    test("does not validate the admin requirement when nothing is submitted", () => {
        const rules = { feed_view: ["everyone"] };
        expect(safeModifyAccessRules(rules, undefined)).toBe(rules);
    });
});

describe("getFullLocationName", () => {
    const location = (overrides: Partial<Location>): Location =>
        ({
            precision: 3,
            country: "Sweden",
            region: "Skane",
            city: "Malmo",
            street: "Storgatan 1",
            ...overrides,
        }) as Location;

    test("returns an empty string without a location", () => {
        expect(getFullLocationName(undefined)).toBe("");
    });

    test("includes only the country at precision 0", () => {
        expect(getFullLocationName(location({ precision: 0 }))).toBe("Sweden");
    });

    test("adds the region at precision 1", () => {
        expect(getFullLocationName(location({ precision: 1 }))).toBe("Sweden, Skane");
    });

    test("adds the city at precision 2", () => {
        expect(getFullLocationName(location({ precision: 2 }))).toBe("Sweden, Skane, Malmo");
    });

    test("adds the street at precision 3", () => {
        expect(getFullLocationName(location({ precision: 3 }))).toBe("Sweden, Skane, Malmo, Storgatan 1");
    });

    test("does not add anything beyond street at precision 4", () => {
        expect(getFullLocationName(location({ precision: 4 }))).toBe("Sweden, Skane, Malmo, Storgatan 1");
    });

    test("skips missing parts without emitting empty separators", () => {
        expect(getFullLocationName(location({ region: undefined, street: undefined }))).toBe("Sweden, Malmo");
    });

    test("yields a leading separator when the country is missing", () => {
        expect(getFullLocationName(location({ country: undefined, precision: 1 }))).toBe(", Skane");
    });

    test("returns an empty string for a negative precision", () => {
        expect(getFullLocationName(location({ precision: -1 }))).toBe("");
    });
});

describe("filterLocations", () => {
    const fullLocation = (precision: number) =>
        ({
            precision,
            country: "Sweden",
            region: "Skane",
            city: "Malmo",
            street: "Storgatan 1",
            lngLat: { lng: 13, lat: 55 },
        }) as unknown as Location;

    const filtered = (precision: number) => {
        const [item] = filterLocations([{ location: fullLocation(precision) } as Content]);
        return item.location!;
    };

    test("keeps only the country at precision 0", () => {
        const location = filtered(0);
        expect(location.country).toBe("Sweden");
        expect(location.region).toBeUndefined();
        expect(location.city).toBeUndefined();
        expect(location.street).toBeUndefined();
        expect(location.lngLat).toBeUndefined();
    });

    test("keeps country and region at precision 1", () => {
        const location = filtered(1);
        expect(location.region).toBe("Skane");
        expect(location.city).toBeUndefined();
        expect(location.street).toBeUndefined();
        expect(location.lngLat).toBeUndefined();
    });

    test("keeps up to the city at precision 2", () => {
        const location = filtered(2);
        expect(location.city).toBe("Malmo");
        expect(location.street).toBeUndefined();
        expect(location.lngLat).toBeUndefined();
    });

    test("only strips coordinates at precision 3", () => {
        const location = filtered(3);
        expect(location.street).toBe("Storgatan 1");
        expect(location.lngLat).toBeUndefined();
    });

    test("leaves the exact location untouched at precision 4", () => {
        const location = filtered(4);
        expect(location.street).toBe("Storgatan 1");
        expect(location.lngLat).toEqual({ lng: 13, lat: 55 });
    });

    test("treats an unknown precision like precision 0", () => {
        const location = filtered(99);
        expect(location.country).toBe("Sweden");
        expect(location.region).toBeUndefined();
        expect(location.lngLat).toBeUndefined();
    });

    test("skips items without a location", () => {
        const item = { title: "no location" } as unknown as Content;
        expect(filterLocations([item])[0]).toBe(item);
    });

    test("mutates and returns the same array", () => {
        const content = [{ location: fullLocation(0) } as Content];
        expect(filterLocations(content)).toBe(content);
        expect(content[0].location!.region).toBeUndefined();
    });

    test("returns an empty array for empty input", () => {
        expect(filterLocations([])).toEqual([]);
    });
});

describe("safeModifyMemberUserGroups", () => {
    const circle = {
        userGroups: [
            { handle: "admins", accessLevel: 1 },
            { handle: "moderators", accessLevel: 2 },
            { handle: "members", accessLevel: 3 },
        ],
    } as unknown as Circle;

    test("adds a submitted group that exists on the circle", () => {
        expect(safeModifyMemberUserGroups([], ["members"], circle, 2, false)).toEqual(["members"]);
    });

    test("removes an existing group that was not resubmitted", () => {
        expect(safeModifyMemberUserGroups(["members"], [], circle, 2, false)).toEqual([]);
    });

    test("sorts the result by ascending access level", () => {
        expect(safeModifyMemberUserGroups(["members"], ["moderators", "members"], circle, 1, false)).toEqual([
            "moderators",
            "members",
        ]);
        expect(safeModifyMemberUserGroups([], ["members", "admins", "moderators"], circle, 1, false)).toEqual([
            "admins",
            "moderators",
            "members",
        ]);
    });

    test("does not duplicate a group that is both existing and submitted", () => {
        expect(safeModifyMemberUserGroups(["members"], ["members"], circle, 2, false)).toEqual(["members"]);
    });

    test("ignores submitted groups that do not exist on the circle", () => {
        expect(safeModifyMemberUserGroups([], ["ghost"], circle, 0, false)).toEqual([]);
    });

    test("keeps existing groups unknown to the circle, since they can never be permissible", () => {
        expect(safeModifyMemberUserGroups(["legacy"], [], circle, 0, false)).toEqual(["legacy"]);
    });

    test("treats a circle without user groups as having nothing modifiable", () => {
        const bare = {} as Circle;
        expect(safeModifyMemberUserGroups(["members"], ["admins"], bare, 0, true)).toEqual(["members"]);
    });

    // The permission filter is written as `map.get(handle) ?? 0 > accessLevel` (and `>=` for
    // same-level edits), which parses as `map.get(handle) ?? (0 > accessLevel)`. Every group known
    // to the circle has a defined level, so the comparison is never evaluated and the filter simply
    // returns that level: any group with a non-zero level is treated as modifiable. These tests
    // pin that behavior; the `accessLevel` and `canEditSameLevel` parameters currently have no effect.
    describe("permission filter operator precedence", () => {
        test("ignores the acting access level for groups with a non-zero level", () => {
            expect(safeModifyMemberUserGroups([], ["admins", "moderators"], circle, 2, false)).toEqual([
                "admins",
                "moderators",
            ]);
            expect(safeModifyMemberUserGroups(["admins"], [], circle, 2, false)).toEqual([]);
            expect(safeModifyMemberUserGroups([], ["admins"], circle, 999, false)).toEqual(["admins"]);
        });

        test("behaves identically whether or not same-level edits are allowed", () => {
            const inputs: [string[], string[]][] = [
                [[], ["admins", "moderators", "members"]],
                [["admins"], []],
                [["moderators", "members"], ["admins"]],
            ];
            for (const [existing, submitted] of inputs) {
                for (const accessLevel of [0, 1, 2, 3, 999]) {
                    expect(safeModifyMemberUserGroups(existing, submitted, circle, accessLevel, true)).toEqual(
                        safeModifyMemberUserGroups(existing, submitted, circle, accessLevel, false),
                    );
                }
            }
        });

        test("never treats a group with access level 0 as modifiable", () => {
            const withZero = {
                userGroups: [{ handle: "root", accessLevel: 0 }],
            } as unknown as Circle;
            expect(safeModifyMemberUserGroups([], ["root"], withZero, 0, true)).toEqual([]);
            expect(safeModifyMemberUserGroups(["root"], [], withZero, 0, false)).toEqual(["root"]);
        });
    });

    test("does not mutate its inputs", () => {
        const existing = ["members"];
        const submitted = ["moderators"];
        safeModifyMemberUserGroups(existing, submitted, circle, 1, false);
        expect(existing).toEqual(["members"]);
        expect(submitted).toEqual(["moderators"]);
    });
});

describe("relative time helpers", () => {
    useFakeNow(NOW);

    describe("timeSince (elapsed)", () => {
        test.each([
            [0, "0 seconds"],
            [1, "1 second"],
            [59, "59 seconds"],
            [MINUTE, "1 minute"],
            [2 * MINUTE, "2 minutes"],
            [59 * MINUTE + 59, "59 minutes"],
            [HOUR, "1 hour"],
            [5 * HOUR, "5 hours"],
            [DAY, "1 day"],
            [3 * DAY, "3 days"],
            [MONTH, "1 month"],
            [7 * MONTH, "7 months"],
            [YEAR, "1 year"],
            [3 * YEAR, "3 years"],
        ])("%d seconds ago is %p", (seconds, expected) => {
            expect(timeSince(secondsAgo(seconds), false)).toBe(expected);
        });

        test.each([
            [1, "1s"],
            [30, "30s"],
            [MINUTE, "1m"],
            [HOUR, "1h"],
            [DAY, "1d"],
            [MONTH, "1mo"],
            [3 * MONTH, "3mo"],
            [YEAR, "1y"],
            [4 * YEAR, "4y"],
        ])("short format for %d seconds ago is %p", (seconds, expected) => {
            expect(timeSince(secondsAgo(seconds), false, true)).toBe(expected);
        });

        test("uses floor semantics on the boundary between units", () => {
            expect(timeSince(secondsAgo(MINUTE - 1), false)).toBe("59 seconds");
            expect(timeSince(secondsAgo(2 * MINUTE - 1), false)).toBe("1 minute");
        });

        test("reports a negative number of seconds for a future date", () => {
            expect(timeSince(secondsFromNow(30), false)).toBe("-30 seconds");
        });

        test("accepts a date string as well as a Date", () => {
            expect(timeSince(secondsAgo(2 * HOUR).toISOString() as unknown as Date, false)).toBe("2 hours");
        });
    });

    describe("timeSince (time until)", () => {
        test("counts down to a future date", () => {
            expect(timeSince(secondsFromNow(3 * DAY), true)).toBe("3 days");
            expect(timeSince(secondsFromNow(HOUR), true, true)).toBe("1h");
        });

        test("reports a negative amount for a date in the past", () => {
            expect(timeSince(secondsAgo(30), true)).toBe("-30 seconds");
        });
    });

    describe("getDateLong", () => {
        test("formats month and day using the runtime locale", () => {
            const formatted = getDateLong(new Date(2026, 2, 9, 12));
            expect(formatted).toBe(new Date(2026, 2, 9, 12).toLocaleDateString(undefined, { month: "long", day: "numeric" }));
            expect(formatted).toContain("9");
        });

        test("returns undefined when there is no date", () => {
            expect(getDateLong(undefined as unknown as Date)).toBeUndefined();
        });

        test("returns undefined when the value has no toLocaleDateString", () => {
            expect(getDateLong("2026-01-01" as unknown as Date)).toBeUndefined();
        });
    });

    describe("isToday", () => {
        test("is true for the current instant", () => {
            expect(isToday(new Date())).toBe(true);
        });

        test("is false for a date two days ago or ahead", () => {
            expect(isToday(secondsAgo(2 * DAY))).toBe(false);
            expect(isToday(secondsFromNow(2 * DAY))).toBe(false);
        });

        test("accepts anything the Date constructor accepts", () => {
            expect(isToday(NOW.toISOString() as unknown as Date)).toBe(true);
        });

        test("is false for an invalid date", () => {
            expect(isToday(new Date("nope"))).toBe(false);
        });
    });

    describe("getPublishTime", () => {
        test("returns an empty string without a date", () => {
            expect(getPublishTime(undefined as unknown as Date)).toBe("");
        });

        test("returns a short relative time for a date from today", () => {
            expect(getPublishTime(secondsAgo(30))).toBe("30s");
        });

        test("returns the long date for an older date", () => {
            const older = secondsAgo(3 * DAY);
            expect(getPublishTime(older)).toBe(getDateLong(older));
        });
    });
});

describe("truncateText", () => {
    test("returns an empty string for empty or missing text", () => {
        expect(truncateText("", 5)).toBe("");
        expect(truncateText(undefined as unknown as string, 5)).toBe("");
        expect(truncateText(null as unknown as string, 5)).toBe("");
    });

    test("returns the text unchanged when it fits", () => {
        expect(truncateText("hello", 5)).toBe("hello");
        expect(truncateText("hi", 5)).toBe("hi");
    });

    test("truncates and appends an ellipsis when too long", () => {
        expect(truncateText("hello world", 5)).toBe("hello...");
    });

    test("handles a max length of zero", () => {
        expect(truncateText("hello", 0)).toBe("...");
    });
});

describe("haversineKm", () => {
    const london: [number, number] = [-0.1278, 51.5074];
    const paris: [number, number] = [2.3522, 48.8566];

    test("returns infinity when either coordinate is missing", () => {
        expect(haversineKm(undefined, paris)).toBe(Number.POSITIVE_INFINITY);
        expect(haversineKm(london, undefined)).toBe(Number.POSITIVE_INFINITY);
        expect(haversineKm()).toBe(Number.POSITIVE_INFINITY);
    });

    test("is zero for identical points", () => {
        expect(haversineKm(london, london)).toBe(0);
    });

    test("measures London to Paris at roughly 344 km", () => {
        expect(haversineKm(london, paris)).toBeCloseTo(343.5, 0);
    });

    test("is symmetric", () => {
        expect(haversineKm(london, paris)).toBeCloseTo(haversineKm(paris, london), 10);
    });

    test("accepts {lng, lat} objects and tuples interchangeably", () => {
        const asObject = (point: [number, number]) => ({ lng: point[0], lat: point[1] });
        expect(haversineKm(asObject(london), asObject(paris))).toBeCloseTo(haversineKm(london, paris), 10);
        expect(haversineKm(asObject(london), paris)).toBeCloseTo(haversineKm(london, paris), 10);
    });

    test("measures half the earth's circumference between antipodes", () => {
        expect(haversineKm([0, 0], [180, 0])).toBeCloseTo(Math.PI * 6371, 3);
    });
});

describe("getUserLocation", () => {
    test("returns undefined for a missing user or location", () => {
        expect(getUserLocation(undefined)).toBeUndefined();
        expect(getUserLocation(null)).toBeUndefined();
        expect(getUserLocation({})).toBeUndefined();
        expect(getUserLocation({ location: {} })).toBeUndefined();
    });

    test("reads a [lng, lat] tuple from lngLat", () => {
        expect(getUserLocation({ location: { lngLat: [13, 55] } })).toEqual([13, 55]);
    });

    test("reads a {lng, lat} object from lngLat", () => {
        expect(getUserLocation({ location: { lngLat: { lng: 13, lat: 55 } } })).toEqual([13, 55]);
    });

    test("falls back to a coordinates tuple", () => {
        expect(getUserLocation({ location: { coordinates: [1, 2] } })).toEqual([1, 2]);
    });

    test("prefers lngLat over coordinates", () => {
        expect(getUserLocation({ location: { lngLat: [13, 55], coordinates: [1, 2] } })).toEqual([13, 55]);
    });

    test("falls back to coordinates when lngLat is malformed", () => {
        expect(getUserLocation({ location: { lngLat: [1], coordinates: [7, 8] } })).toEqual([7, 8]);
        expect(getUserLocation({ location: { lngLat: { lng: 1 }, coordinates: [7, 8] } })).toEqual([7, 8]);
    });

    test("returns undefined when neither shape is valid", () => {
        expect(getUserLocation({ location: { lngLat: [1, 2, 3], coordinates: [1] } })).toBeUndefined();
        expect(getUserLocation({ location: { lngLat: "13,55" } })).toBeUndefined();
    });

    test("returns a copy rather than the original tuple", () => {
        const original: [number, number] = [13, 55];
        const result = getUserLocation({ location: { lngLat: original } });
        expect(result).toEqual(original);
        expect(result).not.toBe(original);
    });
});
