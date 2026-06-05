import type { Circle } from "@/models/models";
import { DEFAULT_HERO_IMAGE_URLS } from "@/lib/default-heroes";

export type VerificationReadinessItem = {
    key: "picture" | "coverImage" | "aboutText";
    label: string;
    complete: boolean;
};

export type VerificationReadiness = {
    isReady: boolean;
    title: string;
    items: VerificationReadinessItem[];
};

const DEFAULT_PICTURE_URLS = new Set(["/images/default-picture.png", "/images/default-user-picture.png"]);
const DEFAULT_COVER_URLS = new Set(["/images/default-cover.png", ...DEFAULT_HERO_IMAGE_URLS]);

const hasCustomPicture = (circle?: Partial<Circle> | null): boolean => {
    const url = circle?.picture?.url?.trim();
    return Boolean(url && !DEFAULT_PICTURE_URLS.has(url));
};

const hasCustomCoverImage = (circle?: Partial<Circle> | null): boolean =>
    Boolean(circle?.images?.some((image) => image.fileInfo?.url && !DEFAULT_COVER_URLS.has(image.fileInfo.url)));

const hasAboutText = (circle?: Partial<Circle> | null): boolean => {
    if (circle?.circleType === "user") {
        return Boolean(circle.content?.trim() || circle.description?.trim());
    }

    return Boolean(circle?.content?.trim() || circle?.description?.trim());
};

export const getVerificationReadiness = (circle?: Partial<Circle> | null): VerificationReadiness => {
    const isUserProfile = circle?.circleType === "user";

    const items: VerificationReadinessItem[] = isUserProfile
        ? [
              {
                  key: "picture",
                  label: "Add a profile picture",
                  complete: hasCustomPicture(circle),
              },
              {
                  key: "aboutText",
                  label: "Add About text",
                  complete: hasAboutText(circle),
              },
          ]
        : [
              {
                  key: "picture",
                  label: "Add a circle picture",
                  complete: hasCustomPicture(circle),
              },
              {
                  key: "coverImage",
                  label: "Add a cover image - the wide banner image at the top of the page",
                  complete: hasCustomCoverImage(circle),
              },
              {
                  key: "aboutText",
                  label: "Add About text",
                  complete: hasAboutText(circle),
              },
          ];

    return {
        isReady: items.every((item) => item.complete),
        title: isUserProfile
            ? "Complete your profile before requesting verification."
            : "Complete this circle before requesting verification.",
        items,
    };
};
