import type { Circle, GroupedNotificationSettings, Location, Media, UserPrivate } from "@/models/models";

export type ClientCircleSummary = Pick<Circle, "did" | "name" | "handle" | "circleType" | "description" | "mission"> & {
    _id?: string;
    picture?: { url: string; originalName?: string; fileName?: string };
};
export type ClientMembership = {
    circleId: string;
    userGroups: string[];
    joinedAt: Date;
    circle: ClientCircleSummary;
};
export type ClientPendingRequest = {
    userDid: string;
    circleId: string;
    status: "pending" | "approved" | "rejected";
    requestedAt: Date;
};
export type ClientChatMembership = {
    userDid: string;
    chatRoomId: string;
    joinedAt: Date;
    role: "admin" | "member";
    chatRoom: { _id?: string; name: string; handle: string; createdAt: Date; userGroups: string[] };
};

export type AuthenticatedClientUser = {
    _id?: string;
    did?: string;
    name?: string;
    type?: "user" | "organization";
    handle?: string;
    picture?: { url: string; originalName?: string; fileName?: string };
    images?: Media[];
    description?: string;
    content?: string;
    mission?: string;
    circleType?: "user" | "circle" | "project";
    userGroups?: UserPrivate["userGroups"];
    causes?: string[];
    skills?: string[];
    offers?: UserPrivate["offers"];
    location?: Location;
    isAdmin?: boolean;
    isEmailVerified?: boolean;
    isVerified?: boolean;
    isHuman?: boolean;
    isMember?: boolean;
    manualMember?: boolean;
    isFoundingMember?: boolean;
    verificationStatus?: UserPrivate["verificationStatus"];
    accountStatus?: UserPrivate["accountStatus"];
    memberships: ClientMembership[];
    friends: ClientMembership[];
    pendingRequests: ClientPendingRequest[];
    chatRoomMemberships: ClientChatMembership[];
    ignoredCircles?: string[];
    bookmarkedCircles?: string[];
    pinnedCircles?: string[];
    hiddenCancelledEventIds?: string[];
    completedOnboardingSteps?: string[];
    agreedToTos?: boolean;
    agreedToEmailUpdates?: boolean;
    communityGuidelinesAcceptance?: UserPrivate["communityGuidelinesAcceptance"];
    communityGuidelinesAcceptedAt?: Date;
    notificationSettings?: GroupedNotificationSettings;
    onboardingFlow?: string;
};

export type BookmarkStateDto = { bookmarkedCircles: string[] };
export type PinStateDto = { pinnedCircles: string[]; bookmarkedCircles: string[] };
export type GuidelineStateDto = Pick<
    AuthenticatedClientUser,
    "communityGuidelinesAcceptance" | "communityGuidelinesAcceptedAt"
>;

const copyStrings = (value: unknown): string[] | undefined =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;

function sanitizeCommunityGuidelinesAcceptance(
    value: UserPrivate["communityGuidelinesAcceptance"],
): UserPrivate["communityGuidelinesAcceptance"] {
    if (!value) return undefined;
    return {
        truth: { accepted: value.truth?.accepted === true, acceptedAt: value.truth?.acceptedAt ?? null },
        constructive: {
            accepted: value.constructive?.accepted === true,
            acceptedAt: value.constructive?.acceptedAt ?? null,
        },
        respect: { accepted: value.respect?.accepted === true, acceptedAt: value.respect?.acceptedAt ?? null },
        privacy: { accepted: value.privacy?.accepted === true, acceptedAt: value.privacy?.acceptedAt ?? null },
        responsibility: {
            accepted: value.responsibility?.accepted === true,
            acceptedAt: value.responsibility?.acceptedAt ?? null,
        },
    };
}

function sanitizeNotificationSettings(
    value: UserPrivate["notificationSettings"],
): GroupedNotificationSettings | undefined {
    if (!value || typeof value !== "object") return undefined;
    const result: Record<string, Record<string, Record<string, { isEnabled: boolean; isConfigurable: boolean }>>> = {};
    for (const [entityType, entities] of Object.entries(value)) {
        if (!entities || typeof entities !== "object") continue;
        result[entityType] = {};
        for (const [entityId, settings] of Object.entries(entities)) {
            if (!settings || typeof settings !== "object") continue;
            result[entityType][entityId] = {};
            for (const [notificationType, setting] of Object.entries(settings)) {
                if (!setting || typeof setting !== "object") continue;
                result[entityType][entityId][notificationType] = {
                    isEnabled: setting.isEnabled === true,
                    isConfigurable: setting.isConfigurable === true,
                };
            }
        }
    }
    return result as GroupedNotificationSettings;
}

export function toAuthenticatedClientUser(user: UserPrivate): AuthenticatedClientUser {
    const picture = user.picture?.url
        ? {
              url: user.picture.url,
              ...(typeof user.picture.originalName === "string" ? { originalName: user.picture.originalName } : {}),
              ...(typeof user.picture.fileName === "string" ? { fileName: user.picture.fileName } : {}),
          }
        : undefined;
    const notificationSettings = sanitizeNotificationSettings(user.notificationSettings);
    const communityGuidelinesAcceptance = sanitizeCommunityGuidelinesAcceptance(user.communityGuidelinesAcceptance);
    const onboardingFlow = typeof user.metadata?.onboardingFlow === "string" ? user.metadata.onboardingFlow : undefined;

    return {
        ...(user._id != null ? { _id: String(user._id) } : {}),
        ...(typeof user.did === "string" ? { did: user.did } : {}),
        ...(typeof user.name === "string" ? { name: user.name } : {}),
        ...(user.type ? { type: user.type } : {}),
        ...(typeof user.handle === "string" ? { handle: user.handle } : {}),
        ...(picture ? { picture } : {}),
        ...(Array.isArray(user.images)
            ? {
                  images: user.images.map((image) => ({
                      name: image.name,
                      type: image.type,
                      fileInfo: {
                          url: image.fileInfo.url,
                          ...(image.fileInfo.originalName ? { originalName: image.fileInfo.originalName } : {}),
                          ...(image.fileInfo.fileName ? { fileName: image.fileInfo.fileName } : {}),
                      },
                  })),
              }
            : {}),
        ...(typeof user.description === "string" ? { description: user.description } : {}),
        ...(typeof user.content === "string" ? { content: user.content } : {}),
        ...(typeof user.mission === "string" ? { mission: user.mission } : {}),
        ...(user.circleType ? { circleType: user.circleType } : {}),
        ...(Array.isArray(user.userGroups)
            ? {
                  userGroups: user.userGroups.map((group) => ({
                      name: group.name,
                      handle: group.handle,
                      title: group.title,
                      description: group.description,
                      accessLevel: group.accessLevel,
                      ...(typeof group.readOnly === "boolean" ? { readOnly: group.readOnly } : {}),
                  })),
              }
            : {}),
        ...(copyStrings(user.causes) ? { causes: copyStrings(user.causes) } : {}),
        ...(copyStrings(user.skills) ? { skills: copyStrings(user.skills) } : {}),
        ...(user.offers
            ? {
                  offers: {
                      ...(typeof user.offers.text === "string" ? { text: user.offers.text } : {}),
                      ...(copyStrings(user.offers.skills) ? { skills: copyStrings(user.offers.skills) } : {}),
                      visibility: user.offers.visibility,
                  },
              }
            : {}),
        ...(user.location
            ? {
                  location: {
                      precision: user.location.precision,
                      country: user.location.country,
                      region: user.location.region,
                      city: user.location.city,
                  },
              }
            : {}),
        ...(typeof user.isAdmin === "boolean" ? { isAdmin: user.isAdmin } : {}),
        ...(typeof user.isEmailVerified === "boolean" ? { isEmailVerified: user.isEmailVerified } : {}),
        ...(typeof user.isVerified === "boolean" ? { isVerified: user.isVerified } : {}),
        ...(typeof user.isHuman === "boolean" ? { isHuman: user.isHuman } : {}),
        ...(typeof user.isMember === "boolean" ? { isMember: user.isMember } : {}),
        ...(typeof user.manualMember === "boolean" ? { manualMember: user.manualMember } : {}),
        ...(typeof user.isFoundingMember === "boolean" ? { isFoundingMember: user.isFoundingMember } : {}),
        ...(user.verificationStatus ? { verificationStatus: user.verificationStatus } : {}),
        ...(user.accountStatus ? { accountStatus: user.accountStatus } : {}),
        memberships: (user.memberships ?? []).map((membership) => ({
            circleId: membership.circleId,
            userGroups: copyStrings(membership.userGroups) ?? [],
            joinedAt: membership.joinedAt,
            circle: {
                ...(membership.circle?._id != null ? { _id: String(membership.circle._id) } : {}),
                did: membership.circle?.did,
                name: membership.circle?.name,
                handle: membership.circle?.handle,
                ...(membership.circle?.picture?.url
                    ? {
                          picture: {
                              url: membership.circle.picture.url,
                              ...(typeof membership.circle.picture.originalName === "string"
                                  ? { originalName: membership.circle.picture.originalName }
                                  : {}),
                              ...(typeof membership.circle.picture.fileName === "string"
                                  ? { fileName: membership.circle.picture.fileName }
                                  : {}),
                          },
                      }
                    : {}),
                circleType: membership.circle?.circleType,
                description: membership.circle?.description,
                mission: membership.circle?.mission,
            },
        })),
        friends: [],
        pendingRequests: (user.pendingRequests ?? []).map((request) => ({
            userDid: request.userDid,
            circleId: request.circleId,
            status: request.status,
            requestedAt: request.requestedAt,
        })),
        chatRoomMemberships: (user.chatRoomMemberships ?? []).map((membership) => ({
            userDid: membership.userDid,
            chatRoomId: membership.chatRoomId,
            joinedAt: membership.joinedAt,
            role: membership.role ?? "member",
            chatRoom: {
                ...(membership.chatRoom?._id != null ? { _id: String(membership.chatRoom._id) } : {}),
                name: membership.chatRoom?.name ?? "",
                handle: membership.chatRoom?.handle ?? "",
                createdAt: membership.chatRoom?.createdAt ?? membership.joinedAt,
                userGroups: copyStrings(membership.chatRoom?.userGroups) ?? [],
            },
        })),
        ...(copyStrings(user.ignoredCircles) ? { ignoredCircles: copyStrings(user.ignoredCircles) } : {}),
        ...(copyStrings(user.bookmarkedCircles) ? { bookmarkedCircles: copyStrings(user.bookmarkedCircles) } : {}),
        ...(copyStrings(user.pinnedCircles) ? { pinnedCircles: copyStrings(user.pinnedCircles) } : {}),
        ...(copyStrings(user.hiddenCancelledEventIds)
            ? { hiddenCancelledEventIds: copyStrings(user.hiddenCancelledEventIds) }
            : {}),
        ...(copyStrings(user.completedOnboardingSteps)
            ? { completedOnboardingSteps: copyStrings(user.completedOnboardingSteps) }
            : {}),
        ...(typeof user.agreedToTos === "boolean" ? { agreedToTos: user.agreedToTos } : {}),
        ...(typeof user.agreedToEmailUpdates === "boolean" ? { agreedToEmailUpdates: user.agreedToEmailUpdates } : {}),
        ...(communityGuidelinesAcceptance ? { communityGuidelinesAcceptance } : {}),
        ...(user.communityGuidelinesAcceptedAt
            ? { communityGuidelinesAcceptedAt: user.communityGuidelinesAcceptedAt }
            : {}),
        ...(notificationSettings ? { notificationSettings } : {}),
        ...(onboardingFlow ? { onboardingFlow } : {}),
    };
}

export const toBookmarkStateDto = (user: UserPrivate): BookmarkStateDto => ({
    bookmarkedCircles: copyStrings(user.bookmarkedCircles) ?? [],
});
export const toPinStateDto = (user: UserPrivate): PinStateDto => ({
    pinnedCircles: copyStrings(user.pinnedCircles) ?? [],
    bookmarkedCircles: copyStrings(user.bookmarkedCircles) ?? [],
});
export const toGuidelineStateDto = (user: UserPrivate): GuidelineStateDto => ({
    communityGuidelinesAcceptance: sanitizeCommunityGuidelinesAcceptance(user.communityGuidelinesAcceptance),
    communityGuidelinesAcceptedAt: user.communityGuidelinesAcceptedAt,
});
