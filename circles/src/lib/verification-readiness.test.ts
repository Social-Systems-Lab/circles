import { describe, expect, test } from "bun:test";
import type { Circle, Media } from "@/models/models";
import { DEFAULT_HERO_IMAGE_URLS } from "./default-heroes";
import { getVerificationReadiness } from "./verification-readiness";

const image = (url?: string) => ({ name: "img", type: "image/png", fileInfo: { url } }) as unknown as Media;
const byKey = (readiness: ReturnType<typeof getVerificationReadiness>) =>
    Object.fromEntries(readiness.items.map((item) => [item.key, item.complete]));

const readyCircle = (): Partial<Circle> => ({
    circleType: "circle",
    picture: { url: "/storage/circles/pic.png" } as Circle["picture"],
    images: [image("/storage/circles/cover.png")],
    description: "About the circle",
});

const readyUser = (): Partial<Circle> => ({
    circleType: "user",
    picture: { url: "/storage/users/pic.png" } as Circle["picture"],
    description: "About me",
});

describe("getVerificationReadiness for circles", () => {
    test("is ready with a picture, a custom cover image and about text", () => {
        const readiness = getVerificationReadiness(readyCircle());

        expect(readiness.isReady).toBe(true);
        expect(readiness.title).toBe("Complete this circle before requesting verification.");
        expect(readiness.items.map((item) => item.key)).toEqual(["picture", "coverImage", "aboutText"]);
        expect(byKey(readiness)).toEqual({ picture: true, coverImage: true, aboutText: true });
    });

    test("labels the requirements for circles", () => {
        expect(getVerificationReadiness(readyCircle()).items.map((item) => item.label)).toEqual([
            "Add a circle picture",
            "Add a cover image - the wide banner image at the top of the page",
            "Add About text",
        ]);
    });

    test("is not ready when nothing is provided", () => {
        const readiness = getVerificationReadiness({ circleType: "circle" });

        expect(readiness.isReady).toBe(false);
        expect(byKey(readiness)).toEqual({ picture: false, coverImage: false, aboutText: false });
    });

    test("treats a missing profile as a circle with nothing provided", () => {
        for (const value of [undefined, null, {}]) {
            const readiness = getVerificationReadiness(value);
            expect(readiness.isReady).toBe(false);
            expect(readiness.items).toHaveLength(3);
            expect(readiness.title).toBe("Complete this circle before requesting verification.");
        }
    });

    test.each(["/images/default-picture.png", "/images/default-user-picture.png"])(
        "rejects the default picture %s",
        (url) => {
            const readiness = getVerificationReadiness({ ...readyCircle(), picture: { url } as Circle["picture"] });
            expect(byKey(readiness).picture).toBe(false);
            expect(readiness.isReady).toBe(false);
        },
    );

    test("rejects a blank or missing picture URL", () => {
        expect(byKey(getVerificationReadiness({ ...readyCircle(), picture: { url: "   " } as Circle["picture"] })).picture).toBe(false);
        expect(byKey(getVerificationReadiness({ ...readyCircle(), picture: undefined })).picture).toBe(false);
    });

    test("accepts a picture URL with surrounding whitespace that is not a default", () => {
        expect(
            byKey(getVerificationReadiness({ ...readyCircle(), picture: { url: "  /custom.png  " } as Circle["picture"] })).picture,
        ).toBe(true);
    });

    test("does not trim before comparing against the default picture URLs", () => {
        const picture = { url: " /images/default-picture.png " } as Circle["picture"];
        expect(byKey(getVerificationReadiness({ ...readyCircle(), picture })).picture).toBe(false);
    });

    test("rejects the default cover image and every default hero image", () => {
        for (const url of ["/images/default-cover.png", ...DEFAULT_HERO_IMAGE_URLS]) {
            const readiness = getVerificationReadiness({ ...readyCircle(), images: [image(url)] });
            expect(byKey(readiness).coverImage).toBe(false);
        }
    });

    test("rejects images without a URL or an empty image list", () => {
        expect(byKey(getVerificationReadiness({ ...readyCircle(), images: [image(undefined)] })).coverImage).toBe(false);
        expect(byKey(getVerificationReadiness({ ...readyCircle(), images: [] })).coverImage).toBe(false);
        expect(byKey(getVerificationReadiness({ ...readyCircle(), images: undefined })).coverImage).toBe(false);
    });

    test("accepts a cover image when at least one image is custom", () => {
        const readiness = getVerificationReadiness({
            ...readyCircle(),
            images: [image(DEFAULT_HERO_IMAGE_URLS[0]), image("/storage/circles/custom.png")],
        });
        expect(byKey(readiness).coverImage).toBe(true);
    });

    test("accepts about text from either description or content", () => {
        expect(byKey(getVerificationReadiness({ ...readyCircle(), description: undefined, content: "Long form" })).aboutText).toBe(true);
        expect(byKey(getVerificationReadiness({ ...readyCircle(), description: "Short", content: undefined })).aboutText).toBe(true);
    });

    test("rejects blank about text", () => {
        expect(byKey(getVerificationReadiness({ ...readyCircle(), description: "  ", content: "\n" })).aboutText).toBe(false);
        expect(byKey(getVerificationReadiness({ ...readyCircle(), description: undefined, content: undefined })).aboutText).toBe(false);
    });

    test("reports the single missing requirement", () => {
        const readiness = getVerificationReadiness({ ...readyCircle(), images: [] });
        expect(readiness.isReady).toBe(false);
        expect(byKey(readiness)).toEqual({ picture: true, coverImage: false, aboutText: true });
    });

    test("treats projects like circles", () => {
        const readiness = getVerificationReadiness({ ...readyCircle(), circleType: "project" });
        expect(readiness.items).toHaveLength(3);
        expect(readiness.isReady).toBe(true);
    });
});

describe("getVerificationReadiness for user profiles", () => {
    test("only requires a picture and about text", () => {
        const readiness = getVerificationReadiness(readyUser());

        expect(readiness.isReady).toBe(true);
        expect(readiness.title).toBe("Complete your profile before requesting verification.");
        expect(readiness.items.map((item) => item.key)).toEqual(["picture", "aboutText"]);
        expect(readiness.items.map((item) => item.label)).toEqual(["Add a profile picture", "Add About text"]);
    });

    test("does not require a cover image", () => {
        expect(getVerificationReadiness({ ...readyUser(), images: [] }).isReady).toBe(true);
    });

    test("is not ready without a real picture", () => {
        const readiness = getVerificationReadiness({
            ...readyUser(),
            picture: { url: "/images/default-user-picture.png" } as Circle["picture"],
        });
        expect(readiness.isReady).toBe(false);
        expect(byKey(readiness)).toEqual({ picture: false, aboutText: true });
    });

    test("is not ready without about text", () => {
        const readiness = getVerificationReadiness({ ...readyUser(), description: "", content: "" });
        expect(readiness.isReady).toBe(false);
        expect(byKey(readiness)).toEqual({ picture: true, aboutText: false });
    });
});
