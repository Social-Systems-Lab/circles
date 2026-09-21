// Shared contract for the per-circle "save settings" server actions (access rules, questionnaire, user groups, ...).
// They all: require a signed-in user, check a settings feature, make sure the circle exists, update it, refresh the
// settings page and turn errors into a `{ success: false, message }` result.
//
//   const deps = mockCircleSettingsDependencies();
//   const { saveQuestionnaire } = await import("./actions");
//
//   testCircleSettingsContract(deps, {
//       save: () => saveQuestionnaire({ _id: "circle-1", questionnaire: [] }),
//       feature: "edit_questionnaire",
//       successMessage: "Circle questionnaire saved successfully",
//       failurePrefix: "Failed to save circle questionnaire. ",
//       revalidated: ["/circles/demo/settings/questionnaire"],
//       update: { _id: "circle-1", questionnaire: [] },
//   });

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { features } from "@/lib/data/constants";
import type { FormSubmitResponse } from "@/models/models";
import { silenceConsole } from "./hooks";
import { mockAuthModule } from "./mock-auth";

export const SETTINGS_CIRCLE_ID = "circle-1";
export const SETTINGS_CIRCLE_PATH = "/circles/demo/";

export function mockCircleSettingsDependencies() {
    const auth = mockAuthModule();
    const getCircleById = mock(async (_id: string): Promise<Record<string, unknown> | null> => ({ _id: SETTINGS_CIRCLE_ID, circleType: "circle" }));
    const getCirclePath = mock(async (_circle: unknown) => SETTINGS_CIRCLE_PATH);
    const updateCircle = mock(async (_circle: unknown, _userDid: string) => {});
    mock.module("@/lib/data/circle", () => ({ getCircleById, getCirclePath, updateCircle }));

    const revalidatePath = mock((_path: string) => {});
    mock.module("next/cache", () => ({ revalidatePath }));

    // The actions log their input; keep the test output clean.
    silenceConsole("log");

    beforeEach(() => {
        getCircleById.mockReset();
        getCircleById.mockResolvedValue({ _id: SETTINGS_CIRCLE_ID, circleType: "circle" });
        getCirclePath.mockReset();
        getCirclePath.mockResolvedValue(SETTINGS_CIRCLE_PATH);
        updateCircle.mockReset();
        updateCircle.mockResolvedValue(undefined);
        revalidatePath.mockReset();
    });

    return { ...auth, getCircleById, getCirclePath, updateCircle, revalidatePath };
}

export type CircleSettingsDependencies = ReturnType<typeof mockCircleSettingsDependencies>;

export type CircleSettingsContract = {
    /** Calls the action under test with a valid payload for `SETTINGS_CIRCLE_ID`. */
    save: () => Promise<FormSubmitResponse>;
    /** Handle of the `features.settings.*` entry the action must check. */
    feature: keyof typeof features.settings;
    successMessage: string;
    /** Prefix of the message returned when a non-Error value is thrown. */
    failurePrefix: string;
    /** Paths the action must refresh after saving. */
    revalidated: string[];
    /** What the action must pass to `updateCircle`. */
    update: Record<string, unknown>;
};

export function testCircleSettingsContract(deps: CircleSettingsDependencies, spec: CircleSettingsContract) {
    describe("settings save contract", () => {
        test("saves for an authorized user, refreshes the settings pages and reports success", async () => {
            const result = await spec.save();

            expect(result).toEqual({ success: true, message: spec.successMessage });
            expect(deps.updateCircle).toHaveBeenCalledTimes(1);
            expect(deps.updateCircle.mock.calls[0][0]).toMatchObject(spec.update);
            expect(deps.updateCircle.mock.calls[0][1]).toBe("did:user");
            expect(deps.revalidatePath.mock.calls.map(([path]) => path)).toEqual(spec.revalidated);
        });

        test("asks for the circle's settings feature on behalf of the signed-in user", async () => {
            await spec.save();

            expect(deps.isAuthorized).toHaveBeenCalledWith("did:user", SETTINGS_CIRCLE_ID, features.settings[spec.feature]);
        });

        test("requires the user to be logged in, without checking permissions or saving", async () => {
            deps.getAuthenticatedUserDid.mockResolvedValue(undefined);

            expect(await spec.save()).toEqual({ success: false, message: "You need to be logged in to edit circle settings" });

            expect(deps.isAuthorized).not.toHaveBeenCalled();
            expect(deps.updateCircle).not.toHaveBeenCalled();
        });

        test("refuses users who are not authorized, without saving or refreshing anything", async () => {
            deps.isAuthorized.mockResolvedValue(false);

            expect(await spec.save()).toEqual({ success: false, message: "You are not authorized to edit circle settings" });

            expect(deps.getCircleById).not.toHaveBeenCalled();
            expect(deps.updateCircle).not.toHaveBeenCalled();
            expect(deps.revalidatePath).not.toHaveBeenCalled();
        });

        test("reports a circle that does not exist", async () => {
            deps.getCircleById.mockResolvedValue(null);

            expect(await spec.save()).toEqual({ success: false, message: "Circle not found" });

            expect(deps.updateCircle).not.toHaveBeenCalled();
        });

        test("reports the message of an error thrown while saving, without refreshing pages", async () => {
            deps.updateCircle.mockRejectedValue(new Error("Unauthorized to change that"));

            expect(await spec.save()).toEqual({ success: false, message: "Unauthorized to change that" });

            expect(deps.revalidatePath).not.toHaveBeenCalled();
        });

        test("describes a thrown value that is not an Error", async () => {
            deps.updateCircle.mockRejectedValue({ code: 42 });

            expect(await spec.save()).toEqual({ success: false, message: `${spec.failurePrefix}{"code":42}` });
        });

        test("lets a failure of the permission check itself escape, since it runs outside the error handling", async () => {
            deps.isAuthorized.mockRejectedValue(new Error("db down"));

            await expect(spec.save()).rejects.toThrow("db down");
        });
    });
}
