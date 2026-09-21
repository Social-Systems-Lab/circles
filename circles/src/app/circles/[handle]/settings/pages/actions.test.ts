import { beforeEach, describe, expect, mock, test } from "bun:test";
import { modules } from "@/lib/data/constants";
import { SETTINGS_CIRCLE_ID, mockCircleSettingsDependencies, testCircleSettingsContract } from "@/test/circle-settings-contract";

const deps = mockCircleSettingsDependencies();

const getUserPrivate = mock(async (_did: string): Promise<Record<string, unknown>> => ({ did: "did:user", isAdmin: false }));
mock.module("@/lib/data/user", () => ({ getUserPrivate }));

const { savePages } = await import("./actions");

const readOnlyHandles = modules.filter((module) => module.readOnly).map((module) => module.handle);
const optionalHandles = modules.filter((module) => !module.readOnly).map((module) => module.handle);
const requested = optionalHandles.filter((handle) => handle !== "funding").slice(0, 2);
const save = () => savePages({ _id: SETTINGS_CIRCLE_ID, enabledModules: requested });
const savedModules = () => (deps.updateCircle.mock.calls[0][0] as { enabledModules: string[] }).enabledModules;

beforeEach(() => {
    getUserPrivate.mockReset();
    getUserPrivate.mockResolvedValue({ did: "did:user", isAdmin: false });
});

describe("savePages", () => {
    testCircleSettingsContract(deps, {
        save,
        feature: "edit_pages",
        successMessage: "Circle modules saved successfully",
        failurePrefix: "Failed to save circle modules. ",
        revalidated: ["/circles/demo/", "/circles/demo/settings/pages"],
        update: { _id: SETTINGS_CIRCLE_ID },
    });

    describe("which modules get saved", () => {
        test("has some read-only and some optional modules to work with", () => {
            expect(readOnlyHandles.length).toBeGreaterThan(0);
            expect(requested.length).toBe(2);
        });

        test("always includes the read-only modules, plus the requested ones", async () => {
            await save();

            for (const handle of [...readOnlyHandles, ...requested]) expect(savedModules()).toContain(handle);
        });

        test("leaves out optional modules that were not requested", async () => {
            await save();

            const notRequested = optionalHandles.filter((handle) => !requested.includes(handle));
            for (const handle of notRequested) expect(savedModules()).not.toContain(handle);
        });

        test("ignores requested modules that do not exist", async () => {
            await savePages({ _id: SETTINGS_CIRCLE_ID, enabledModules: [...requested, "made-up-module"] });

            expect(savedModules()).not.toContain("made-up-module");
        });

        test("saves only the read-only modules when none are requested", async () => {
            await savePages({ _id: SETTINGS_CIRCLE_ID, enabledModules: [] });

            expect([...savedModules()].sort()).toEqual([...readOnlyHandles].sort());
        });

        test("orders the modules like the built-in module list", async () => {
            await savePages({ _id: SETTINGS_CIRCLE_ID, enabledModules: [...requested].reverse() });

            const order = modules.map((module) => module.handle);
            expect(savedModules()).toEqual([...savedModules()].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
        });
    });

    describe("funding needs", () => {
        const withFunding = () => savePages({ _id: SETTINGS_CIRCLE_ID, enabledModules: [...requested, "funding"] });

        test("can only be switched on for circles", async () => {
            deps.getCircleById.mockResolvedValue({ _id: SETTINGS_CIRCLE_ID, circleType: "user", enabledModules: [] });
            getUserPrivate.mockResolvedValue({ isAdmin: true });

            expect(await withFunding()).toEqual({ success: false, message: "Funding Needs can only be enabled on circles in this MVP." });
            expect(deps.updateCircle).not.toHaveBeenCalled();
        });

        test("can only be switched on by super admins", async () => {
            deps.getCircleById.mockResolvedValue({ _id: SETTINGS_CIRCLE_ID, circleType: "circle", enabledModules: [] });

            expect(await withFunding()).toEqual({ success: false, message: "Only Super Admins can enable or disable Funding Needs." });
            expect(deps.updateCircle).not.toHaveBeenCalled();
        });

        test("can only be switched off by super admins", async () => {
            deps.getCircleById.mockResolvedValue({ _id: SETTINGS_CIRCLE_ID, circleType: "circle", enabledModules: ["funding", ...requested] });

            expect(await save()).toEqual({ success: false, message: "Only Super Admins can enable or disable Funding Needs." });
        });

        test("is switched on by a super admin for a circle", async () => {
            deps.getCircleById.mockResolvedValue({ _id: SETTINGS_CIRCLE_ID, circleType: "circle", enabledModules: [] });
            getUserPrivate.mockResolvedValue({ isAdmin: true });

            expect((await withFunding()).success).toBe(true);
            expect(savedModules()).toContain("funding");
        });

        test("is switched off by a super admin", async () => {
            deps.getCircleById.mockResolvedValue({ _id: SETTINGS_CIRCLE_ID, circleType: "circle", enabledModules: ["funding"] });
            getUserPrivate.mockResolvedValue({ isAdmin: true });

            expect((await save()).success).toBe(true);
            expect(savedModules()).not.toContain("funding");
        });

        test("does not need a super admin when funding stays as it was", async () => {
            deps.getCircleById.mockResolvedValue({ _id: SETTINGS_CIRCLE_ID, circleType: "circle", enabledModules: ["funding"] });

            expect((await withFunding()).success).toBe(true);
            expect((await save()).success).toBe(false);
        });

        test("keeps funding on for a circle where it is already on, even for regular admins", async () => {
            deps.getCircleById.mockResolvedValue({ _id: SETTINGS_CIRCLE_ID, circleType: "circle", enabledModules: ["funding"] });

            expect((await withFunding()).success).toBe(true);
        });

        test("does not allow it on projects even if it was somehow enabled before", async () => {
            deps.getCircleById.mockResolvedValue({ _id: SETTINGS_CIRCLE_ID, circleType: "project", enabledModules: ["funding"] });
            getUserPrivate.mockResolvedValue({ isAdmin: true });

            expect((await withFunding()).success).toBe(false);
        });
    });
});
