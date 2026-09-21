import { beforeEach, describe, expect, mock, test } from "bun:test";
import { silenceConsole } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";
import { sdgs } from "@/lib/data/sdgs";
import { skills } from "@/lib/data/skills";

mockDb();
mock.module("next/cache", () => ({ revalidatePath: () => {} }));

// The Qdrant hits each lookup gets back. The fake serves them through both `search` (a bare array)
// and `query` (wrapped in `{ points }`) so these tests describe what the actions return and stay
// valid across either client API.
type Hit = { id?: string; score?: number; payload?: Record<string, unknown> };

let hits: Hit[] = [];
let searchCalls: Array<{ collection: string; args: Record<string, unknown> }> = [];
let qdrantError: Error | null = null;

const qdrantClient = {
    search: async (collection: string, args: Record<string, unknown>) => {
        if (qdrantError) throw qdrantError;
        searchCalls.push({ collection, args });
        return hits;
    },
    query: async (collection: string, args: Record<string, unknown>) => {
        if (qdrantError) throw qdrantError;
        const { query, ...rest } = args;
        searchCalls.push({ collection, args: { ...rest, vector: query ?? rest.vector } });
        return { points: hits };
    },
};

let circleObject: { vector?: number[] } | null = { vector: [0.1, 0.2] };

// Other modules in the import graph pull further exports from vdb, so keep the real module and
// replace only the two functions these actions use.
const realVdb = await import("@/lib/data/vdb");
mock.module("@/lib/data/vdb", () => ({
    ...realVdb,
    getQdrantClient: async () => qdrantClient,
    getVbdCircleById: async () => circleObject,
}));

const getUserByHandle = mock(async (_handle: string) => ({ picture: { url: "https://cdn/u.png" } }) as unknown);
const realUser = await import("@/lib/data/user");
mock.module("@/lib/data/user", () => ({ ...realUser, getUserByHandle }));

const consoleSpy = silenceConsole("log", "error", "warn");

const { fetchSdgsMatchedToCircle, fetchSkillsMatchedToCircle, fetchMissionStatements } = await import("./actions");

beforeEach(() => {
    hits = [];
    searchCalls = [];
    qdrantError = null;
    circleObject = { vector: [0.1, 0.2] };
    getUserByHandle.mockClear();
    consoleSpy.error.mockClear();
});

describe("fetchSdgsMatchedToCircle", () => {
    test("searches the sdgs collection with the circle vector", async () => {
        await fetchSdgsMatchedToCircle("circle-1");

        expect(searchCalls).toEqual([{ collection: "sdgs", args: { vector: [0.1, 0.2], limit: 100 } }]);
    });

    test("maps a hit onto the sdg handle, picture and similarity", async () => {
        const known = sdgs[0];
        hits = [{ score: 0.42, payload: { name: known.name, description: "from qdrant" } }];

        const result = await fetchSdgsMatchedToCircle("circle-1");

        expect(result).toEqual({
            success: true,
            sdgs: [
                {
                    handle: known.handle,
                    name: known.name,
                    description: "from qdrant",
                    picture: known.picture ?? "",
                    metrics: { similarity: 0.42 },
                },
            ],
        });
    });

    test("defaults the similarity to 1 when the hit has no score", async () => {
        hits = [{ payload: { name: sdgs[0].name, description: "d" } }];

        const result = await fetchSdgsMatchedToCircle("circle-1");

        expect(result.sdgs[0].metrics).toEqual({ similarity: 1 });
    });

    test("leaves the handle undefined for a name that is not a known sdg", async () => {
        hits = [{ score: 0.5, payload: { name: "Not An SDG", description: "d" } }];

        const result = await fetchSdgsMatchedToCircle("circle-1");

        expect(result.sdgs[0]).toMatchObject({ handle: undefined, name: "Not An SDG", picture: "" });
    });

    test.each([
        ["the circle has no vector", { vector: undefined }],
        ["the circle is missing", null],
    ])("falls back to every sdg when %s", async (_label, circle) => {
        circleObject = circle as never;

        const result = await fetchSdgsMatchedToCircle("circle-1");

        expect(result.success).toBe(true);
        expect(result.sdgs).toBe(sdgs as never);
        expect(searchCalls).toHaveLength(0);
    });

    test("falls back to every sdg when the search returns nothing", async () => {
        hits = [];

        const result = await fetchSdgsMatchedToCircle("circle-1");

        expect(result).toEqual({ success: true, sdgs: sdgs as never });
    });

    test("reports success with every sdg when the search throws", async () => {
        qdrantError = new Error("qdrant down");

        const result = await fetchSdgsMatchedToCircle("circle-1");

        expect(result).toEqual({ success: true, sdgs: sdgs as never });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error fetching sdgs:", qdrantError);
    });
});

describe("fetchSkillsMatchedToCircle", () => {
    test("searches the skills collection with the circle vector", async () => {
        await fetchSkillsMatchedToCircle("circle-1");

        expect(searchCalls).toEqual([{ collection: "skills", args: { vector: [0.1, 0.2], limit: 100 } }]);
    });

    test("maps a hit onto the skill handle, picture and similarity", async () => {
        const known = skills[0];
        hits = [{ score: 0.33, payload: { name: known.name, description: "from qdrant" } }];

        const result = await fetchSkillsMatchedToCircle("circle-1");

        expect(result).toEqual({
            success: true,
            skills: [
                {
                    handle: known.handle,
                    name: known.name,
                    description: "from qdrant",
                    picture: known.picture ?? "",
                    metrics: { similarity: 0.33 },
                },
            ],
        });
    });

    test.each([
        ["the circle has no vector", { vector: undefined }],
        ["the circle is missing", null],
    ])("falls back to every skill when %s", async (_label, circle) => {
        circleObject = circle as never;

        const result = await fetchSkillsMatchedToCircle("circle-1");

        expect(result.success).toBe(true);
        expect(result.skills).toBe(skills as never);
    });

    test("falls back to every skill when the search returns nothing", async () => {
        hits = [];

        expect(await fetchSkillsMatchedToCircle("circle-1")).toEqual({ success: true, skills: skills as never });
    });

    // Unlike the sdg lookup, a thrown search is reported as a failure with no skills at all.
    test("reports failure with the error message when the search throws", async () => {
        qdrantError = new Error("qdrant down");

        const result = await fetchSkillsMatchedToCircle("circle-1");

        expect(result).toEqual({ success: false, skills: [], message: "qdrant down" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error fetching skills:", qdrantError);
    });
});

describe("fetchMissionStatements", () => {
    const LONG = "a mission statement comfortably longer than the cutoff";
    const SHORT = "too short";

    test("searches the circles collection for 30 neighbours", async () => {
        await fetchMissionStatements("circle-1");

        expect(searchCalls).toEqual([{ collection: "circles", args: { vector: [0.1, 0.2], limit: 30 } }]);
    });

    test("returns a mission with the author's picture and similarity", async () => {
        hits = [{ score: 0.7, payload: { name: "Ada", handle: "ada", mission: LONG } }];

        const result = await fetchMissionStatements("circle-1");

        expect(result).toEqual({
            success: true,
            missions: [
                { name: "Ada", picture: "https://cdn/u.png", mission: LONG, metrics: { similarity: 0.7 } },
            ] as never,
        });
        expect(getUserByHandle).toHaveBeenCalledWith("ada");
    });

    test("defaults the similarity to 0 when the hit has no score", async () => {
        hits = [{ payload: { name: "Ada", handle: "ada", mission: LONG } }];

        const [mission] = (await fetchMissionStatements("circle-1")).missions;

        expect((mission as unknown as { metrics: unknown }).metrics).toEqual({ similarity: 0 });
    });

    test("uses an empty picture when the author cannot be found", async () => {
        getUserByHandle.mockResolvedValueOnce(null);
        hits = [{ payload: { name: "Ada", handle: "ada", mission: LONG } }];

        expect((await fetchMissionStatements("circle-1")).missions[0].picture).toBe("");
    });

    test.each([
        ["a mission of 25 characters or fewer", SHORT],
        ["an empty mission", ""],
        ["no mission at all", undefined],
    ])("skips %s", async (_label, mission) => {
        hits = [{ payload: { name: "Ada", handle: "ada", mission } }];

        expect((await fetchMissionStatements("circle-1")).missions).toEqual([]);
    });

    test("keeps a mission of exactly 26 characters", async () => {
        const mission = "x".repeat(26);
        hits = [{ payload: { name: "Ada", handle: "ada", mission } }];

        expect((await fetchMissionStatements("circle-1")).missions).toHaveLength(1);
    });

    test.each([
        ["the circle has no vector", { vector: undefined }],
        ["the circle is missing", null],
    ])("returns no missions when %s", async (_label, circle) => {
        circleObject = circle as never;

        expect(await fetchMissionStatements("circle-1")).toEqual({ success: true, missions: [] });
    });

    test("reports failure with the error message when the search throws", async () => {
        qdrantError = new Error("qdrant down");

        const result = await fetchMissionStatements("circle-1");

        expect(result).toEqual({ success: false, missions: [], message: "qdrant down" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error fetching mission statements:", qdrantError);
    });
});
