import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Circle } from "@/models/models";
import { features } from "@/lib/data/constants";
import { silenceConsole } from "@/test/hooks";
import { mockAuthModule } from "@/test/mock-auth";

const { getAuthenticatedUserDid, isAuthorized } = mockAuthModule();
const consoleSpy = silenceConsole("error");

const updateCircle = mock(async (_circle: unknown, _userDid: string) => {});
mock.module("@/lib/data/circle", () => ({ updateCircle }));

const revalidatePath = mock((_path: string) => {});
mock.module("next/cache", () => ({ revalidatePath }));

const { savePresence } = await import("./actions");

const data = (overrides: Record<string, unknown> = {}) =>
    ({
        _id: "circle-1",
        handle: "demo",
        interests: ["ignored-here"],
        offers: { text: "I can help", skills: ["gardening"], visibility: "public" },
        engagements: { text: "I want to learn", interests: ["climate", "music"], visibility: "members" },
        needs: { text: "A ride", visibility: "public" },
        ...overrides,
    }) as unknown as Circle;

beforeEach(() => {
    updateCircle.mockReset();
    updateCircle.mockResolvedValue(undefined);
    revalidatePath.mockReset();
});

describe("savePresence", () => {
    test("saves the presence fields and reports success", async () => {
        expect(await savePresence(data())).toEqual({ success: true, message: "Presence settings updated successfully" });

        expect(updateCircle).toHaveBeenCalledTimes(1);
        expect(updateCircle.mock.calls[0][1]).toBe("did:user");
    });

    test("moves the engagement interests to the profile's interests and keeps the other engagement settings", async () => {
        await savePresence(data());

        expect(updateCircle.mock.calls[0][0]).toEqual({
            _id: "circle-1",
            interests: ["climate", "music"],
            offers: { text: "I can help", skills: ["gardening"], visibility: "public" },
            engagements: { text: "I want to learn", visibility: "members" },
            needs: { text: "A ride", visibility: "public" },
        });
    });

    test("does not mutate the submitted engagements", async () => {
        const submitted = data();

        await savePresence(submitted);

        expect(submitted.engagements?.interests).toEqual(["climate", "music"]);
    });

    test("handles a profile without engagements", async () => {
        await savePresence(data({ engagements: undefined }));

        expect(updateCircle.mock.calls[0][0]).toMatchObject({ interests: undefined, engagements: undefined });
    });

    test("ignores the top-level interests of the payload", async () => {
        await savePresence(data({ engagements: undefined }));

        expect((updateCircle.mock.calls[0][0] as { interests: unknown }).interests).toBeUndefined();
    });

    test("refreshes the presence settings, home and profile pages", async () => {
        await savePresence(data());

        expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
            "/circles/demo/settings/presence",
            "/circles/demo/home",
            "/circles/demo",
        ]);
    });

    test("checks the about-settings permission on the circle for the signed-in user", async () => {
        await savePresence(data());

        expect(isAuthorized).toHaveBeenCalledWith("did:user", "circle-1", features.settings.edit_about);
    });

    test("fails, without saving, when nobody is signed in", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        expect(await savePresence(data())).toEqual({ success: false, message: "Failed to update presence settings" });

        expect(updateCircle).not.toHaveBeenCalled();
        expect(consoleSpy.error).toHaveBeenCalledWith("Error saving presence settings:", expect.any(Error));
    });

    test("fails, without saving, when the user is not authorized", async () => {
        isAuthorized.mockResolvedValue(false);

        expect(await savePresence(data())).toEqual({ success: false, message: "Failed to update presence settings" });

        expect(updateCircle).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    test("gives the same generic failure, without details, when saving throws", async () => {
        updateCircle.mockRejectedValue(new Error("secret internals"));

        const result = await savePresence(data());

        expect(result).toEqual({ success: false, message: "Failed to update presence settings" });
        expect(JSON.stringify(result)).not.toContain("secret internals");
    });
});
