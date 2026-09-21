import { describe, expect, test } from "bun:test";
import { SETTINGS_CIRCLE_ID, mockCircleSettingsDependencies, testCircleSettingsContract } from "@/test/circle-settings-contract";

const deps = mockCircleSettingsDependencies();
const { saveAccessRules } = await import("./actions");

const accessRules = { feed: { view: ["everyone"], post: ["members"] }, settings: { edit_settings: ["admins"] } };
const save = () => saveAccessRules({ _id: SETTINGS_CIRCLE_ID, accessRules });

describe("saveAccessRules", () => {
    testCircleSettingsContract(deps, {
        save,
        feature: "edit_access_rules",
        successMessage: "Circle access rules saved successfully",
        failurePrefix: "Failed to save circle access rules. ",
        revalidated: ["/circles/demo/settings/access-rules"],
        update: { _id: SETTINGS_CIRCLE_ID, accessRules },
    });

    test("saves only the circle id and the access rules", async () => {
        await save();

        expect(deps.updateCircle.mock.calls[0][0]).toEqual({ _id: SETTINGS_CIRCLE_ID, accessRules });
    });

    test("does not pre-validate the rules, leaving that to the circle update", async () => {
        const result = await saveAccessRules({ _id: SETTINGS_CIRCLE_ID, accessRules: {} });

        expect(result.success).toBe(true);
        expect(deps.updateCircle.mock.calls[0][0]).toEqual({ _id: SETTINGS_CIRCLE_ID, accessRules: {} });
    });

    test("surfaces the circle update's validation error to the user", async () => {
        deps.updateCircle.mockRejectedValue(new Error("Admins must have access to edit settings"));

        expect(await save()).toEqual({ success: false, message: "Admins must have access to edit settings" });
    });
});
