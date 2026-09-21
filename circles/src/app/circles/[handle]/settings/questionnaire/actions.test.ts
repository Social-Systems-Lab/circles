import { describe, expect, test } from "bun:test";
import type { Question } from "@/models/models";
import { SETTINGS_CIRCLE_ID, mockCircleSettingsDependencies, testCircleSettingsContract } from "@/test/circle-settings-contract";

const deps = mockCircleSettingsDependencies();
const { saveQuestionnaire } = await import("./actions");

const questionnaire: Question[] = [
    { question: "Why do you want to join?", type: "text" },
    { question: "Have you read the rules?", type: "yesno" },
];
const save = () => saveQuestionnaire({ _id: SETTINGS_CIRCLE_ID, questionnaire });

describe("saveQuestionnaire", () => {
    testCircleSettingsContract(deps, {
        save,
        feature: "edit_questionnaire",
        successMessage: "Circle questionnaire saved successfully",
        failurePrefix: "Failed to save circle questionnaire. ",
        revalidated: ["/circles/demo/settings/questionnaire"],
        update: { _id: SETTINGS_CIRCLE_ID, questionnaire },
    });

    test("saves only the circle id and the questions", async () => {
        await save();

        expect(deps.updateCircle.mock.calls[0][0]).toEqual({ _id: SETTINGS_CIRCLE_ID, questionnaire });
    });

    test("can clear the questionnaire with an empty list", async () => {
        const result = await saveQuestionnaire({ _id: SETTINGS_CIRCLE_ID, questionnaire: [] });

        expect(result.success).toBe(true);
        expect(deps.updateCircle.mock.calls[0][0]).toEqual({ _id: SETTINGS_CIRCLE_ID, questionnaire: [] });
    });
});
