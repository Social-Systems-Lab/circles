import { describe, expect, test } from "bun:test";
import type { UserGroup } from "@/models/models";
import { SETTINGS_CIRCLE_ID, mockCircleSettingsDependencies, testCircleSettingsContract } from "@/test/circle-settings-contract";

const deps = mockCircleSettingsDependencies();
const { saveUserGroups } = await import("./actions");

const group = (handle: string, accessLevel: number, extra: Partial<UserGroup> = {}) => ({ handle, name: handle, accessLevel, ...extra }) as UserGroup;
const submitted = [group("admins", 1), group("members", 3), group("volunteers", 4)];
const save = () => saveUserGroups({ _id: SETTINGS_CIRCLE_ID, userGroups: submitted });

const existing = (userGroups?: UserGroup[]) => ({ _id: SETTINGS_CIRCLE_ID, circleType: "circle", userGroups });

describe("saveUserGroups", () => {
    testCircleSettingsContract(deps, {
        save,
        feature: "edit_user_groups",
        successMessage: "Circle user groups saved successfully",
        failurePrefix: "Failed to save circle user groups. ",
        revalidated: ["/circles/demo/settings/user-groups"],
        update: { _id: SETTINGS_CIRCLE_ID },
    });

    describe("read-only groups", () => {
        test("keeps the read-only flag of groups that were read-only before, even if the client dropped it", async () => {
            deps.getCircleById.mockResolvedValue(existing([group("admins", 1, { readOnly: true }), group("members", 3)]));

            await save();

            const saved = (deps.updateCircle.mock.calls[0][0] as { userGroups: UserGroup[] }).userGroups;
            expect(saved.find((g) => g.handle === "admins")?.readOnly).toBe(true);
            expect(saved.find((g) => g.handle === "members")?.readOnly).toBeUndefined();
        });

        test("does not let a client mark a group read-only that was not", async () => {
            deps.getCircleById.mockResolvedValue(existing([group("members", 3)]));

            await saveUserGroups({ _id: SETTINGS_CIRCLE_ID, userGroups: [group("members", 3, { readOnly: true })] });

            const saved = (deps.updateCircle.mock.calls[0][0] as { userGroups: UserGroup[] }).userGroups;
            expect(saved[0].readOnly).toBe(true);
        });

        test("keeps the order and content of the submitted groups", async () => {
            deps.getCircleById.mockResolvedValue(existing([group("admins", 1, { readOnly: true })]));

            await save();

            const saved = (deps.updateCircle.mock.calls[0][0] as { userGroups: UserGroup[] }).userGroups;
            expect(saved.map((g) => g.handle)).toEqual(["admins", "members", "volunteers"]);
            expect(saved.find((g) => g.handle === "volunteers")).toEqual(group("volunteers", 4));
        });

        test("saves the submitted groups unchanged when the circle had none", async () => {
            deps.getCircleById.mockResolvedValue(existing(undefined));

            await save();

            expect((deps.updateCircle.mock.calls[0][0] as { userGroups: UserGroup[] }).userGroups).toEqual(submitted);
        });

        test("does not drop the read-only group when the client omits it entirely", async () => {
            deps.getCircleById.mockResolvedValue(existing([group("admins", 1, { readOnly: true })]));

            await saveUserGroups({ _id: SETTINGS_CIRCLE_ID, userGroups: [group("members", 3)] });

            // Only flags are preserved here; keeping omitted groups is left to the circle update.
            expect((deps.updateCircle.mock.calls[0][0] as { userGroups: UserGroup[] }).userGroups.map((g) => g.handle)).toEqual(["members"]);
        });
    });
});
