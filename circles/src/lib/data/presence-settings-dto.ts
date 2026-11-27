import { visibilitySchema, type Circle } from "@/models/models";

export type PresenceSettingsDto = Pick<Circle, "_id" | "handle" | "circleType"> & {
    offers: Partial<NonNullable<Circle["offers"]>>;
    engagements: Partial<NonNullable<Circle["engagements"]>>;
    needs: Partial<NonNullable<Circle["needs"]>>;
};

const text = (value: unknown) => (typeof value === "string" ? value : undefined);
const handles = (value: unknown) =>
    Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : undefined;
const flag = (value: unknown) => (typeof value === "boolean" ? value : undefined);
const visibility = (value: unknown, hasContent: boolean) =>
    value === undefined && !hasContent ? "public" : visibilitySchema.safeParse(value).data;

export const toPresenceSettingsDto = (circle: Circle): PresenceSettingsDto => {
    const { offers, engagements, needs } = circle;
    const offerSkills = handles(offers?.skills);
    const needTags = handles(needs?.tags);
    const interests = handles(circle.interests);
    const engagementInterests = interests?.length ? interests : handles(engagements?.interests);
    const hasEngagement = Boolean(engagements?.text || engagementInterests?.length);
    const hasNeeds = Boolean(needs?.text || needTags?.length);
    return {
        _id: circle._id?.toString(),
        handle: text(circle.handle),
        circleType: circle.circleType,
        offers: {
            text: text(offers?.text),
            skills: offerSkills,
            visibility: visibility(offers?.visibility, Boolean(offers?.text || offerSkills?.length)),
        },
        engagements: {
            text: text(engagements?.text),
            interests: engagementInterests ?? [],
            visibility: visibility(engagements?.visibility, hasEngagement),
            inviteEnabled: flag(engagements?.inviteEnabled) ?? (hasEngagement ? undefined : true),
        },
        needs: {
            text: text(needs?.text),
            tags: needTags,
            visibility: visibility(needs?.visibility, hasNeeds),
            offerHelpEnabled: flag(needs?.offerHelpEnabled) ?? (hasNeeds ? undefined : true),
        },
    };
};
