import { getFeature, hiddenPublicModuleHandles, modules } from "@/lib/data/constants";
import { canSeeFoundingBadge, hasContributorPerks } from "@/lib/auth/perks";
import { isVerifiedUser } from "@/lib/auth/verification";
import type {
    Circle,
    FundingAskDisplay,
    FundingAskItem,
    Location,
    Media,
    MemberDisplay,
    Question,
    SocialLink,
    TaskDisplay,
    TaskPermissions,
} from "@/models/models";
import type { HumanityVerificationSummary } from "@/lib/data/proof-of-humanity";

export type ClientCircleDto = Pick<
    Circle,
    | "_id"
    | "did"
    | "name"
    | "handle"
    | "description"
    | "content"
    | "mission"
    | "members"
    | "circleType"
    | "circleLevel"
    | "parentCircleId"
    | "isVerified"
    | "verificationStatus"
    | "questionnaire"
    | "causes"
    | "skills"
    | "interests"
    | "websiteUrl"
> & {
    dtoKind: "client-circle";
    picture?: { url: string };
    images?: Media[];
    socialLinks?: SocialLink[];
    location?: Location;
    offers?: Circle["offers"];
    engagements?: Circle["engagements"];
    needs?: Circle["needs"];
};

export type ClientParentCircleDto = Pick<Circle, "_id" | "name" | "handle" | "circleType">;
export type ClientAdminDisplayDto = {
    dtoKind: "client-admin-display";
    name: string;
    handle?: string;
    description?: string;
    picture: { url: string };
    location?: Location;
    publicRole: "Admin" | "Moderator" | "Member";
};

export type ClientContributionDto = {
    dtoKind: "client-contribution";
    task: {
        dtoKind: "client-contribution-task";
        _id?: string;
        title: string;
        verifiedAt?: Date;
        contributionNote?: string;
    };
    circle: {
        dtoKind: "client-contribution-circle";
        name: string;
        handle?: string;
    };
};

export type ClientFundingPreviewDto = {
    dtoKind: "client-funding-preview";
    _id?: string;
    title: string;
    shortStory: string;
    items: Array<Pick<FundingAskItem, "title" | "note" | "price" | "currency" | "status">>;
};

export type ClientUpcomingShiftDto = {
    dtoKind: "client-upcoming-shift";
    _id?: string;
    title: string;
    slots?: number;
    participantCount: number;
    targetDate?: Date | null;
    shiftStartTime?: string;
    shiftDurationMinutes?: number;
};

export type ClientVerifierDisplayDto = {
    dtoKind: "client-verifier-display";
    name?: string;
    handle?: string;
    picture?: { url: string };
};

export type ClientHumanityVerificationDto = {
    dtoKind: "client-humanity-verification";
    _id?: string;
    level: "real_person" | "met_in_real_life";
    note?: string;
    verifier?: ClientVerifierDisplayDto;
};

export type ClientHumanityVerificationSummaryDto = {
    dtoKind: "client-humanity-verification-summary";
    realPersonCount: number;
    metInRealLifeCount: number;
    totalActiveCount: number;
    verifications: ClientHumanityVerificationDto[];
    viewerVerification: ClientHumanityVerificationDto | null;
    canCurrentViewerVerify: boolean;
    isOwnProfile: boolean;
};

export type ServerVerifiedContributionInput = { task: TaskDisplay; circle: Circle; permissions: TaskPermissions };

export type AboutPageClientProps = {
    circle: ClientCircleDto;
    showFoundingBadge: boolean;
    adminLeaders: ClientAdminDisplayDto[];
    verifiedContributions: ClientContributionDto[];
    verifiedContributionPublicCount: number;
    fundingPreviewAsks: ClientFundingPreviewDto[];
    fundingPanelVisibility: "visible" | "sign_in" | "members_only";
    upcomingShiftTasks: ClientUpcomingShiftDto[];
    upcomingShiftsVisibility: "visible" | "sign_in" | "members_only";
    canCreateFundingAsk: boolean;
    showFundingPanel: boolean;
    showUpcomingShiftsPanel: boolean;
    proofOfHumanitySummary: ClientHumanityVerificationSummaryDto | null;
};

export type BuildAboutPageClientPropsInput = {
    circle: Circle;
    viewerDid?: string;
    adminLeaders?: MemberDisplay[];
    verifiedContributions?: ServerVerifiedContributionInput[];
    verifiedContributionPublicCount?: number;
    fundingPreviewAsks?: FundingAskDisplay[];
    fundingPanelVisibility: AboutPageClientProps["fundingPanelVisibility"];
    upcomingShiftTasks?: TaskDisplay[];
    upcomingShiftsVisibility: AboutPageClientProps["upcomingShiftsVisibility"];
    canCreateFundingAsk?: boolean;
    showFundingPanel?: boolean;
    showUpcomingShiftsPanel?: boolean;
    proofOfHumanitySummary?: HumanityVerificationSummary | null;
};

const copyStringArray = (value: unknown): string[] | undefined =>
    Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : undefined;

const copyPicture = (value: unknown): { url: string } | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const url = (value as Record<string, unknown>).url;
    return typeof url === "string" ? { url } : undefined;
};

const copyImages = (value: unknown): Media[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const images = value.flatMap((item): Media[] => {
        if (!item || typeof item !== "object") return [];
        const source = item as Record<string, unknown>;
        const fileInfo = copyPicture(source.fileInfo);
        if (typeof source.name !== "string" || typeof source.type !== "string" || !fileInfo) return [];
        return [{ name: source.name, type: source.type, fileInfo }];
    });
    return images.length ? images : undefined;
};

const copySocialLinks = (value: unknown): SocialLink[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const links = value.flatMap((item): SocialLink[] => {
        if (!item || typeof item !== "object") return [];
        const source = item as Record<string, unknown>;
        if (typeof source.platform !== "string" || typeof source.url !== "string") return [];
        return [{ platform: source.platform, url: source.url } as SocialLink];
    });
    return links.length ? links : undefined;
};

const copyQuestionnaire = (value: unknown): Question[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const questions = value.flatMap((item): Question[] => {
        if (!item || typeof item !== "object") return [];
        const source = item as Record<string, unknown>;
        if (typeof source.question !== "string" || (source.type !== "text" && source.type !== "yesno")) return [];
        return [{ question: source.question, type: source.type }];
    });
    return questions;
};

export const buildClientLocation = (value: unknown): Location | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    const precision = source.precision;
    if (typeof precision !== "number" || !Number.isInteger(precision) || precision < 0 || precision > 4) {
        return undefined;
    }

    const location: Location = { precision };
    if (typeof source.country === "string") location.country = source.country;
    if (precision >= 1 && typeof source.region === "string") location.region = source.region;
    if (precision >= 2 && typeof source.city === "string") location.city = source.city;
    if (precision >= 3 && typeof source.street === "string") location.street = source.street;
    if (precision === 4 && source.lngLat && typeof source.lngLat === "object") {
        const lngLat = source.lngLat as Record<string, unknown>;
        if (
            typeof lngLat.lng === "number" &&
            Number.isFinite(lngLat.lng) &&
            typeof lngLat.lat === "number" &&
            Number.isFinite(lngLat.lat)
        ) {
            location.lngLat = { lng: lngLat.lng, lat: lngLat.lat };
        }
    }
    return location;
};

const copyPublicOffers = (value: unknown): Circle["offers"] => {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    if (source.visibility !== "public") return undefined;
    return {
        ...(typeof source.text === "string" ? { text: source.text } : {}),
        ...(copyStringArray(source.skills) ? { skills: copyStringArray(source.skills) } : {}),
        visibility: "public",
    };
};

const copyPublicEngagements = (value: unknown): Circle["engagements"] => {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    if (source.visibility !== "public" || typeof source.inviteEnabled !== "boolean") return undefined;
    return {
        ...(typeof source.text === "string" ? { text: source.text } : {}),
        ...(copyStringArray(source.interests) ? { interests: copyStringArray(source.interests) } : {}),
        inviteEnabled: source.inviteEnabled,
        visibility: "public",
    };
};

const copyPublicNeeds = (value: unknown): Circle["needs"] => {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    if (source.visibility !== "public" || typeof source.offerHelpEnabled !== "boolean") return undefined;
    return {
        ...(typeof source.text === "string" ? { text: source.text } : {}),
        ...(copyStringArray(source.tags) ? { tags: copyStringArray(source.tags) } : {}),
        offerHelpEnabled: source.offerHelpEnabled,
        visibility: "public",
    };
};

export const buildClientCircleDto = (circle: Circle): ClientCircleDto => ({
    dtoKind: "client-circle",
    ...(circle._id !== undefined ? { _id: circle._id?.toString?.() ?? circle._id } : {}),
    ...(typeof circle.did === "string" ? { did: circle.did } : {}),
    ...(typeof circle.name === "string" ? { name: circle.name } : {}),
    ...(typeof circle.handle === "string" ? { handle: circle.handle } : {}),
    ...(copyPicture(circle.picture) ? { picture: copyPicture(circle.picture) } : {}),
    ...(copyImages(circle.images) ? { images: copyImages(circle.images) } : {}),
    ...(typeof circle.description === "string" ? { description: circle.description } : {}),
    ...(typeof circle.content === "string" ? { content: circle.content } : {}),
    ...(typeof circle.mission === "string" ? { mission: circle.mission } : {}),
    ...(typeof circle.members === "number" ? { members: circle.members } : {}),
    ...(circle.circleType ? { circleType: circle.circleType } : {}),
    ...(circle.circleLevel ? { circleLevel: circle.circleLevel } : {}),
    ...(typeof circle.parentCircleId === "string" ? { parentCircleId: circle.parentCircleId } : {}),
    ...(typeof circle.isVerified === "boolean" ? { isVerified: circle.isVerified } : {}),
    ...(circle.verificationStatus ? { verificationStatus: circle.verificationStatus } : {}),
    ...(copyQuestionnaire(circle.questionnaire) ? { questionnaire: copyQuestionnaire(circle.questionnaire) } : {}),
    ...(copyStringArray(circle.causes) ? { causes: copyStringArray(circle.causes) } : {}),
    ...(copyStringArray(circle.skills) ? { skills: copyStringArray(circle.skills) } : {}),
    ...(copyStringArray(circle.interests) ? { interests: copyStringArray(circle.interests) } : {}),
    ...(typeof circle.websiteUrl === "string" ? { websiteUrl: circle.websiteUrl } : {}),
    ...(copySocialLinks(circle.socialLinks) ? { socialLinks: copySocialLinks(circle.socialLinks) } : {}),
    ...(buildClientLocation(circle.location) ? { location: buildClientLocation(circle.location) } : {}),
    ...(copyPublicOffers(circle.offers) ? { offers: copyPublicOffers(circle.offers) } : {}),
    ...(copyPublicEngagements(circle.engagements) ? { engagements: copyPublicEngagements(circle.engagements) } : {}),
    ...(copyPublicNeeds(circle.needs) ? { needs: copyPublicNeeds(circle.needs) } : {}),
});

export const buildClientParentCircleDto = (circle?: Circle | null): ClientParentCircleDto | undefined =>
    circle
        ? {
              ...(circle._id !== undefined ? { _id: circle._id?.toString?.() ?? circle._id } : {}),
              ...(typeof circle.name === "string" ? { name: circle.name } : {}),
              ...(typeof circle.handle === "string" ? { handle: circle.handle } : {}),
              ...(circle.circleType ? { circleType: circle.circleType } : {}),
          }
        : undefined;

export const buildClientAdminDisplayDto = (member: MemberDisplay): ClientAdminDisplayDto => ({
    dtoKind: "client-admin-display",
    name: member.name,
    ...(typeof member.handle === "string" ? { handle: member.handle } : {}),
    ...(typeof member.description === "string" ? { description: member.description } : {}),
    picture: copyPicture(member.picture) ?? { url: "/images/default-user-picture.png" },
    ...(buildClientLocation(member.location) ? { location: buildClientLocation(member.location) } : {}),
    publicRole: member.userGroups?.includes("admins")
        ? "Admin"
        : member.userGroups?.includes("moderators")
          ? "Moderator"
          : "Member",
});

export const hasCompletedWelcomeOnboarding = (circle: Circle): boolean => {
    const steps = circle.completedOnboardingSteps ?? [];
    return steps.includes("welcome") || steps.includes("member") || steps.includes("final");
};

export const buildVisibleCircleModuleHandles = (circle: Circle, viewerGroups: string[]): string[] => {
    const enabledModules = circle.enabledModules ?? [];
    return modules.flatMap((module) => {
        if (!enabledModules.includes(module.handle) || hiddenPublicModuleHandles.includes(module.handle)) return [];
        const accessModuleHandle = module.handle === "shifts" ? "tasks" : module.handle;
        const allowedGroups =
            circle.accessRules?.[accessModuleHandle]?.view ??
            getFeature(accessModuleHandle, "view")?.defaultUserGroups ??
            [];
        return allowedGroups.includes("everyone") || viewerGroups.some((group) => allowedGroups.includes(group))
            ? [module.handle]
            : [];
    });
};

export const buildLayoutClientProps = (
    circle: Circle,
    parentCircle: Circle | undefined,
    viewerDid: string | undefined,
    viewerGroups: string[],
    proofOfHumanitySummary?: HumanityVerificationSummary | null,
) => {
    const isProfileSubject = circle.circleType === "user" && Boolean(viewerDid) && viewerDid === circle.did;
    return {
        homeCover: { circle: buildClientCircleDto(circle) },
        homeContent: {
            circle: buildClientCircleDto(circle),
            parentCircle: buildClientParentCircleDto(parentCircle),
            shouldSuppressWelcomeOnboarding:
                isProfileSubject &&
                (isVerifiedUser(circle) || hasContributorPerks(circle) || hasCompletedWelcomeOnboarding(circle)),
            proofOfHumanitySummary: buildClientHumanityVerificationSummaryDto(proofOfHumanitySummary),
        },
        circleTabs: {
            handle: circle.handle,
            visibleModuleHandles: buildVisibleCircleModuleHandles(circle, viewerGroups),
        },
    };
};

const copyOptionalDate = (value: unknown): Date | undefined => {
    const date = value instanceof Date ? new Date(value) : typeof value === "string" ? new Date(value) : undefined;
    return date && Number.isFinite(date.getTime()) ? date : undefined;
};

export const buildClientContributionDto = (item: ServerVerifiedContributionInput): ClientContributionDto => ({
    dtoKind: "client-contribution",
    task: {
        dtoKind: "client-contribution-task",
        ...(item.task._id !== undefined ? { _id: item.task._id.toString() } : {}),
        title: item.task.title,
        ...(copyOptionalDate(item.task.verifiedAt) ? { verifiedAt: copyOptionalDate(item.task.verifiedAt) } : {}),
        ...(typeof item.task.contributionNote === "string" ? { contributionNote: item.task.contributionNote } : {}),
    },
    circle: {
        dtoKind: "client-contribution-circle",
        name: item.circle.name ?? "Kamooni circle",
        ...(typeof item.circle.handle === "string" ? { handle: item.circle.handle } : {}),
    },
});

export const buildClientFundingPreviewDto = (ask: FundingAskDisplay): ClientFundingPreviewDto => ({
    dtoKind: "client-funding-preview",
    ...(ask._id !== undefined ? { _id: ask._id.toString() } : {}),
    title: ask.title,
    shortStory: ask.shortStory,
    items: (ask.items ?? []).flatMap((item) =>
        typeof item.title === "string" &&
        typeof item.price === "number" &&
        Number.isFinite(item.price) &&
        typeof item.currency === "string" &&
        typeof item.status === "string"
            ? [
                  {
                      title: item.title,
                      ...(typeof item.note === "string" ? { note: item.note } : {}),
                      price: item.price,
                      currency: item.currency,
                      status: item.status,
                  },
              ]
            : [],
    ),
});

export const buildClientUpcomingShiftDto = (task: TaskDisplay): ClientUpcomingShiftDto => ({
    dtoKind: "client-upcoming-shift",
    ...(task._id !== undefined ? { _id: task._id.toString() } : {}),
    title: task.title,
    ...(typeof task.slots === "number" ? { slots: task.slots } : {}),
    participantCount: task.participants?.length ?? 0,
    ...(task.targetDate === null ? { targetDate: null } : {}),
    ...(copyOptionalDate(task.targetDate) ? { targetDate: copyOptionalDate(task.targetDate) } : {}),
    ...(typeof task.shiftStartTime === "string" ? { shiftStartTime: task.shiftStartTime } : {}),
    ...(typeof task.shiftDurationMinutes === "number" ? { shiftDurationMinutes: task.shiftDurationMinutes } : {}),
});

export const buildClientVerifierDisplayDto = (
    circle: Circle | null | undefined,
): ClientVerifierDisplayDto | undefined =>
    circle
        ? {
              dtoKind: "client-verifier-display",
              ...(typeof circle.name === "string" ? { name: circle.name } : {}),
              ...(typeof circle.handle === "string" ? { handle: circle.handle } : {}),
              ...(copyPicture(circle.picture) ? { picture: copyPicture(circle.picture) } : {}),
          }
        : undefined;

const buildClientHumanityVerificationDto = (
    verification: HumanityVerificationSummary["verifications"][number],
): ClientHumanityVerificationDto => ({
    dtoKind: "client-humanity-verification",
    ...(verification._id !== undefined ? { _id: verification._id.toString() } : {}),
    level: verification.level,
    ...(typeof verification.note === "string" ? { note: verification.note } : {}),
    ...(buildClientVerifierDisplayDto(verification.verifier)
        ? { verifier: buildClientVerifierDisplayDto(verification.verifier) }
        : {}),
});

export const buildClientHumanityVerificationSummaryDto = (
    summary?: HumanityVerificationSummary | null,
): ClientHumanityVerificationSummaryDto | null =>
    summary
        ? {
              dtoKind: "client-humanity-verification-summary",
              realPersonCount: summary.realPersonCount,
              metInRealLifeCount: summary.metInRealLifeCount,
              totalActiveCount: summary.totalActiveCount,
              verifications: summary.verifications.map(buildClientHumanityVerificationDto),
              viewerVerification: summary.viewerVerification
                  ? buildClientHumanityVerificationDto(summary.viewerVerification)
                  : null,
              canCurrentViewerVerify: summary.canCurrentViewerVerify,
              isOwnProfile: summary.isOwnProfile,
          }
        : null;

export const buildAboutPageClientProps = (input: BuildAboutPageClientPropsInput): AboutPageClientProps => ({
    circle: buildClientCircleDto(input.circle),
    showFoundingBadge: canSeeFoundingBadge(input.viewerDid, input.circle),
    adminLeaders: (input.adminLeaders ?? []).map(buildClientAdminDisplayDto),
    verifiedContributions: (input.verifiedContributions ?? []).map(buildClientContributionDto),
    verifiedContributionPublicCount: input.verifiedContributionPublicCount ?? 0,
    fundingPreviewAsks: (input.fundingPreviewAsks ?? []).map(buildClientFundingPreviewDto),
    fundingPanelVisibility: input.fundingPanelVisibility,
    upcomingShiftTasks: (input.upcomingShiftTasks ?? []).map(buildClientUpcomingShiftDto),
    upcomingShiftsVisibility: input.upcomingShiftsVisibility,
    canCreateFundingAsk: input.canCreateFundingAsk ?? false,
    showFundingPanel: input.showFundingPanel ?? false,
    showUpcomingShiftsPanel: input.showUpcomingShiftsPanel ?? false,
    proofOfHumanitySummary: buildClientHumanityVerificationSummaryDto(input.proofOfHumanitySummary),
});

export const buildHomeClientProps = (circle: Circle, adminLeaders: MemberDisplay[] = [], viewerDid?: string) => ({
    aboutPage: buildAboutPageClientProps({
        circle,
        adminLeaders,
        viewerDid,
        fundingPanelVisibility: viewerDid ? "members_only" : "sign_in",
        upcomingShiftsVisibility: viewerDid ? "members_only" : "sign_in",
    }),
});
