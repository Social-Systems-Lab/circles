import { describe, expect, test } from "bun:test";
import { SETTINGS_CIRCLE_ID, mockCircleSettingsDependencies, testCircleSettingsContract } from "@/test/circle-settings-contract";

const deps = mockCircleSettingsDependencies();
const { saveMatchmaking } = await import("./actions");

const values = { _id: SETTINGS_CIRCLE_ID, causes: ["sdg-1", "sdg-13"], skills: ["gardening", "carpentry"] };
const save = () => saveMatchmaking(values);

describe("saveMatchmaking", () => {
    testCircleSettingsContract(deps, {
        save,
        feature: "edit_causes_and_skills",
        successMessage: "Circle matchmaking saved successfully",
        failurePrefix: "Failed to save circle matchmaking. ",
        revalidated: ["/circles/demo/settings/matchmaking"],
        update: { _id: SETTINGS_CIRCLE_ID, causes: values.causes, skills: values.skills },
    });

    describe("for circles and projects", () => {
        test.each(["circle", "project"])("saves the causes and skills without touching offers on a %s", async (circleType) => {
            deps.getCircleById.mockResolvedValue({ _id: SETTINGS_CIRCLE_ID, circleType });

            await save();

            expect(deps.updateCircle.mock.calls[0][0]).toEqual({ _id: SETTINGS_CIRCLE_ID, causes: values.causes, skills: values.skills });
        });
    });

    describe("for personal profiles", () => {
        const profile = (offers?: Record<string, unknown>) => ({ _id: SETTINGS_CIRCLE_ID, circleType: "user", offers });

        test("mirrors the skills into the profile's offers", async () => {
            deps.getCircleById.mockResolvedValue(profile());

            await save();

            expect(deps.updateCircle.mock.calls[0][0]).toMatchObject({ offers: { skills: values.skills, visibility: "public" } });
        });

        test("keeps the visibility and text the user already chose", async () => {
            deps.getCircleById.mockResolvedValue(profile({ text: "I can help", visibility: "members", skills: ["old"] }));

            await save();

            expect((deps.updateCircle.mock.calls[0][0] as { offers: unknown }).offers).toEqual({
                text: "I can help",
                visibility: "members",
                skills: values.skills,
            });
        });

        test("leaves offers alone when no skills were submitted", async () => {
            deps.getCircleById.mockResolvedValue(profile({ text: "keep", visibility: "public" }));

            await saveMatchmaking({ _id: SETTINGS_CIRCLE_ID, causes: ["sdg-1"] });

            expect(deps.updateCircle.mock.calls[0][0]).toEqual({ _id: SETTINGS_CIRCLE_ID, causes: ["sdg-1"], skills: undefined });
        });

        test("treats an empty skill list as submitted, clearing the offered skills", async () => {
            deps.getCircleById.mockResolvedValue(profile({ text: "keep", visibility: "public", skills: ["old"] }));

            await saveMatchmaking({ _id: SETTINGS_CIRCLE_ID, skills: [] });

            expect((deps.updateCircle.mock.calls[0][0] as { offers: { skills: string[] } }).offers.skills).toEqual([]);
        });
    });
});
