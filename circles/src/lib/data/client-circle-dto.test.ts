import assert from "node:assert/strict";
import { test } from "node:test";
import type { Circle } from "@/models/models";
import {
    buildAboutPageClientProps,
    buildClientCircleDto,
    buildClientLocation,
    buildHomeClientProps,
    buildLayoutClientProps,
    buildVisibleCircleModuleHandles,
} from "./client-circle-dto";
import { resolveCircleRouteAccess } from "@/app/circles/[handle]/circle-route-access";

const forbiddenSentinels = [
    "private-email@example.test",
    "official-private@example.test",
    "Exact Home Street 99",
    "bookmark-secret-id",
    "pin-secret-id",
    "access-rule-secret",
    "onboarding-secret",
    "internal-metadata-secret",
    "private-offer-secret",
    "members-engagement-secret",
    "malformed-need-secret",
    "unknown-nested-secret",
    "private-custom-group",
    "raw-membership-id",
    "did:example:leader-private",
    "contribution-profile-secret",
    "funding-creator-secret",
    "funding-supporter-secret",
    "shift-profile-secret",
    "verifier-profile-secret",
    "private-secret-circle-name",
];

const makeCircle = (circleType: "circle" | "user"): Circle =>
    ({
        _id: "circle-id",
        did: "did:example:public",
        name: circleType === "user" ? "Synthetic Person" : "Synthetic Organisation",
        handle: circleType === "user" ? "synthetic-person" : "synthetic-organisation",
        circleType,
        picture: { url: "/public-picture.png", originalName: "unknown-nested-secret" },
        images: [
            {
                name: "Public cover",
                type: "image/png",
                fileInfo: { url: "/public-cover.png", originalName: "unknown-nested-secret" },
                unknownMediaKey: "unknown-nested-secret",
            },
        ],
        description: "Public description",
        content: "Public about content",
        mission: "Public mission",
        members: 4,
        parentCircleId: "parent-id",
        circleLevel: "top_level",
        isVerified: false,
        verificationStatus: "unverified",
        isFoundingMember: false,
        questionnaire: [{ question: "Public membership question", type: "text", secret: "unknown-nested-secret" }],
        causes: ["public-cause"],
        skills: ["public-skill"],
        interests: ["public-interest"],
        websiteUrl: "https://example.test",
        socialLinks: [{ platform: "website", url: "https://social.example.test", secret: "unknown-nested-secret" }],
        location: {
            precision: 2,
            country: "Public Country",
            region: "Public Region",
            city: "Public City",
            street: "Exact Home Street 99",
            lngLat: { lng: 18.0123, lat: 59.1234 },
            historicalAddress: "unknown-nested-secret",
        },
        offers: { visibility: "private", text: "private-offer-secret", skills: ["hidden-skill"] },
        engagements: {
            visibility: "members",
            text: "members-engagement-secret",
            interests: ["hidden-interest"],
        },
        needs: { text: "malformed-need-secret", tags: ["hidden-need"] },
        email: "private-email@example.test",
        officialEmail: "official-private@example.test",
        bookmarkedCircles: ["bookmark-secret-id"],
        pinnedCircles: ["pin-secret-id"],
        accessRules: { feed: { view: ["access-rule-secret"] } },
        enabledModules: ["home", "feed", "settings"],
        completedOnboardingSteps: ["onboarding-secret"],
        metadata: { secret: "internal-metadata-secret" },
    }) as unknown as Circle;

const assertForbiddenDataAbsent = (value: unknown) => {
    const serialized = JSON.stringify(value);
    for (const sentinel of forbiddenSentinels) {
        assert.equal(serialized.includes(sentinel), false, `serialized payload contained ${sentinel}`);
    }
    const forbiddenFields = new Set([
        "email",
        "officialEmail",
        "isFoundingMember",
        "manualMember",
        "donationIntent",
        "subscription",
        "bookmarkedCircles",
        "pinnedCircles",
        "accessRules",
        "enabledModules",
        "completedOnboardingSteps",
        "metadata",
    ]);
    const visit = (candidate: unknown) => {
        if (!candidate || typeof candidate !== "object") return;
        if (Array.isArray(candidate)) return candidate.forEach(visit);
        for (const [key, nested] of Object.entries(candidate)) {
            assert.equal(forbiddenFields.has(key), false, `payload contained forbidden field ${key}`);
            visit(nested);
        }
    };
    visit(value);
};

for (const circleType of ["circle", "user"] as const) {
    test(`layout boundary excludes private ${circleType} data`, () => {
        const source = makeCircle(circleType);
        const props = buildLayoutClientProps(source, makeCircle("circle"), undefined, ["members"]);
        const serializedProps = JSON.parse(JSON.stringify(props));
        assertForbiddenDataAbsent(serializedProps);
        assert.deepEqual(Object.keys(serializedProps).sort(), ["circleTabs", "homeContent", "homeCover"]);
        assert.equal(props.homeCover.circle.dtoKind, "client-circle");
        assert.equal(props.homeContent.circle.dtoKind, "client-circle");
        assert.equal(props.homeContent.circle.location?.city, "Public City");
        assert.equal(props.homeContent.circle.location?.street, undefined);
        assert.equal(props.homeContent.circle.location?.lngLat, undefined);
        assert.deepEqual(props.circleTabs.visibleModuleHandles, ["home"]);
        assert.deepEqual(props.homeContent.circle.questionnaire, [
            { question: "Public membership question", type: "text" },
        ]);
    });

    test(`home/About boundary excludes private ${circleType} data`, () => {
        const privateMember = {
            ...makeCircle("user"),
            _id: "raw-membership-id",
            userDid: "did:example:leader-private",
            circleId: "private-host-circle-id",
            userGroups: ["admins", "private-custom-group"],
            name: "Synthetic Leader",
        } as unknown as import("@/models/models").MemberDisplay;
        const props = buildHomeClientProps(makeCircle(circleType), [privateMember]);
        const serializedProps = JSON.parse(JSON.stringify(props));
        assertForbiddenDataAbsent(serializedProps);
        assert.equal(props.aboutPage.circle.dtoKind, "client-circle");
        assert.deepEqual(Object.keys(props.aboutPage.adminLeaders[0]).sort(), [
            "description",
            "dtoKind",
            "handle",
            "location",
            "name",
            "picture",
            "publicRole",
        ]);
        assert.equal(props.aboutPage.adminLeaders[0].publicRole, "Admin");
        assert.deepEqual(props.aboutPage.adminLeaders[0].location, {
            precision: 2,
            country: "Public Country",
            region: "Public Region",
            city: "Public City",
        });
        assert.equal(props.aboutPage.circle.content, "Public about content");
        assert.equal(props.aboutPage.circle.offers, undefined);
        assert.equal(props.aboutPage.circle.engagements, undefined);
        assert.equal(props.aboutPage.circle.needs, undefined);
    });
}

test("public nested profile sections are copied from explicit allowlists", () => {
    const circle = makeCircle("user") as Circle & Record<string, unknown>;
    circle.offers = {
        visibility: "public",
        text: "Public offer",
        skills: ["public-skill"],
        secret: "unknown-nested-secret",
    } as Circle["offers"];
    circle.engagements = {
        visibility: "public",
        text: "Public engagement",
        interests: ["public-interest"],
        inviteEnabled: true,
        secret: "unknown-nested-secret",
    } as Circle["engagements"];
    circle.needs = {
        visibility: "public",
        text: "Public need",
        tags: ["public-need"],
        offerHelpEnabled: true,
        secret: "unknown-nested-secret",
    } as Circle["needs"];

    const dto = buildClientCircleDto(circle);
    assert.deepEqual(dto.offers, { visibility: "public", text: "Public offer", skills: ["public-skill"] });
    assert.deepEqual(dto.engagements, {
        visibility: "public",
        text: "Public engagement",
        interests: ["public-interest"],
        inviteEnabled: true,
    });
    assert.deepEqual(dto.needs, {
        visibility: "public",
        text: "Public need",
        tags: ["public-need"],
        offerHelpEnabled: true,
    });
    assert.equal(JSON.stringify(dto).includes("unknown-nested-secret"), false);
});

test("location precision 0 through 4 exposes exactly the permitted keys", () => {
    const completeLocation = {
        country: "Country",
        region: "Region",
        city: "City",
        street: "Street",
        lngLat: { lng: 18.1, lat: 59.2, altitude: 10 },
        historicalAddress: "unknown-nested-secret",
    };
    assert.deepEqual(buildClientLocation({ ...completeLocation, precision: 0 }), { precision: 0, country: "Country" });
    assert.deepEqual(buildClientLocation({ ...completeLocation, precision: 1 }), {
        precision: 1,
        country: "Country",
        region: "Region",
    });
    assert.deepEqual(buildClientLocation({ ...completeLocation, precision: 2 }), {
        precision: 2,
        country: "Country",
        region: "Region",
        city: "City",
    });
    assert.deepEqual(buildClientLocation({ ...completeLocation, precision: 3 }), {
        precision: 3,
        country: "Country",
        region: "Region",
        city: "City",
        street: "Street",
    });
    assert.deepEqual(buildClientLocation({ ...completeLocation, precision: 4 }), {
        precision: 4,
        country: "Country",
        region: "Region",
        city: "City",
        street: "Street",
        lngLat: { lng: 18.1, lat: 59.2 },
    });
});

test("malformed location precision and coordinates fail closed", () => {
    for (const precision of [undefined, null, "4", -1, 5, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.equal(buildClientLocation({ precision, country: "Country" }), undefined);
    }
    assert.deepEqual(buildClientLocation({ precision: 4, lngLat: { lng: Number.NaN, lat: 59 } }), { precision: 4 });
});

test("visible tabs preserve enabled-module and viewer-group behavior without serializing access rules", () => {
    const circle = makeCircle("circle");
    circle.accessRules = {
        home: { view: ["everyone"] },
        feed: { view: ["members"] },
        settings: { view: ["admins"] },
    };
    assert.deepEqual(buildVisibleCircleModuleHandles(circle, []), ["home"]);
    assert.deepEqual(buildVisibleCircleModuleHandles(circle, ["members"]), ["home", "feed"]);
    assert.deepEqual(buildVisibleCircleModuleHandles(circle, ["admins"]), ["home", "settings"]);
});

test("founding badge is derived for the profile subject only", () => {
    const founder = makeCircle("user");
    founder.isFoundingMember = true;
    const anonymous = buildHomeClientProps(founder, [], undefined);
    const outsider = buildHomeClientProps(founder, [], "did:example:outsider");
    const unrelatedAdmin = buildHomeClientProps(founder, [], "did:example:administrator");
    const owner = buildHomeClientProps(founder, [], founder.did);

    for (const props of [anonymous, outsider, unrelatedAdmin]) {
        assert.equal(props.aboutPage.showFoundingBadge, false);
        assertForbiddenDataAbsent(JSON.parse(JSON.stringify(props)));
    }
    assert.equal(owner.aboutPage.showFoundingBadge, true);
    assert.equal(Object.hasOwn(owner.aboutPage.circle, "isFoundingMember"), false);
});

test("owner-scoped welcome suppression preserves verified and contributor perk behavior", () => {
    const cases: Array<{ update: Partial<Circle>; expected: boolean }> = [
        { update: { isVerified: true }, expected: true },
        { update: { accountStatus: "active", isMember: true }, expected: true },
        { update: { manualMember: true }, expected: true },
        { update: { accountStatus: "active", isFoundingMember: true }, expected: true },
        { update: { completedOnboardingSteps: ["welcome"] }, expected: true },
        { update: {}, expected: false },
    ];

    for (const { update, expected } of cases) {
        const profile = Object.assign(makeCircle("user"), update);
        const ownerProps = buildLayoutClientProps(profile, undefined, profile.did, []);
        assert.equal(ownerProps.homeContent.shouldSuppressWelcomeOnboarding, expected);
        assertForbiddenDataAbsent(JSON.parse(JSON.stringify(ownerProps)));

        const outsiderProps = buildLayoutClientProps(profile, undefined, "did:example:outsider", []);
        assert.equal(outsiderProps.homeContent.shouldSuppressWelcomeOnboarding, false);
        assertForbiddenDataAbsent(JSON.parse(JSON.stringify(outsiderProps)));
    }
});

test("Secret Circle authorization succeeds before browser props are constructed for a canonical member", async () => {
    const secret = Object.assign(makeCircle("circle"), { visibility: "secret" as const });
    let dtoConstructions = 0;
    const access = await resolveCircleRouteAccess(secret.handle!, {
        findCircle: async () => secret,
        authenticate: async () => "did:example:member",
        canReadCircle: async (viewerDid, candidate) =>
            viewerDid === "did:example:member" && candidate._id === secret._id,
    });
    assert.ok(access);
    const props = (() => {
        dtoConstructions += 1;
        return buildLayoutClientProps(access.circle, undefined, access.viewerDid, ["members"]);
    })();
    assert.equal(dtoConstructions, 1);
    assert.equal(props.homeContent.circle.dtoKind, "client-circle");
    assertForbiddenDataAbsent(JSON.parse(JSON.stringify(props)));
});

test("Secret Circle outsider is denied before any browser prop construction", async () => {
    const secret = Object.assign(makeCircle("circle"), { visibility: "secret" as const });
    let dtoConstructions = 0;
    const access = await resolveCircleRouteAccess(secret.handle!, {
        findCircle: async () => secret,
        authenticate: async () => "did:example:outsider",
        canReadCircle: async () => false,
    });
    if (access) {
        dtoConstructions += 1;
        buildLayoutClientProps(access.circle, undefined, access.viewerDid, []);
    }
    assert.equal(access, null);
    assert.equal(dtoConstructions, 0);
});

test("complete AboutPage boundary recursively sanitizes every auxiliary bundle", () => {
    const nestedProfile = (sentinel: string) =>
        ({
            ...makeCircle("user"),
            name: sentinel,
            email: `${sentinel}@example.test`,
            metadata: { sentinel },
            userGroups: ["private-custom-group"],
        }) as unknown as Circle;
    const contributionCircle = nestedProfile("contribution-profile-secret");
    contributionCircle.name = "Visible contribution circle";
    contributionCircle.handle = "visible-contribution-circle";
    const task = {
        _id: "task-id",
        title: "Visible contribution",
        verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        contributionNote: "Visible note",
        author: nestedProfile("contribution-profile-secret"),
        assignee: nestedProfile("contribution-profile-secret"),
        verifier: nestedProfile("contribution-profile-secret"),
        circle: contributionCircle,
        participantProfiles: [nestedProfile("contribution-profile-secret")],
    } as unknown as import("@/models/models").TaskDisplay;
    const fundingAsk = {
        _id: "funding-id",
        title: "Visible funding title",
        shortStory: "Visible funding story",
        items: [{ title: "Visible item", price: 25, currency: "EUR", status: "open", note: "Visible item note" }],
        creator: nestedProfile("funding-creator-secret"),
        activeSupporter: nestedProfile("funding-supporter-secret"),
        circle: nestedProfile("private-secret-circle-name"),
    } as unknown as import("@/models/models").FundingAskDisplay;
    const shift = {
        _id: "shift-id",
        title: "Visible shift",
        slots: 4,
        participants: [{ userDid: "did:private:participant", joinedAt: new Date() }],
        participantProfiles: [nestedProfile("shift-profile-secret")],
        author: nestedProfile("shift-profile-secret"),
        circle: nestedProfile("private-secret-circle-name"),
        targetDate: new Date("2026-02-01T00:00:00.000Z"),
        shiftStartTime: "09:30",
        shiftDurationMinutes: 60,
    } as unknown as import("@/models/models").TaskDisplay;
    const verifier = nestedProfile("verifier-profile-secret");
    verifier.name = "Visible Verifier";
    verifier.handle = "visible-verifier";
    const verification = {
        _id: "verification-id",
        verifierDid: "did:private:verifier",
        subjectDid: "did:private:subject",
        level: "real_person" as const,
        note: "Visible verification note",
        createdAt: new Date(),
        updatedAt: new Date(),
        verifier,
        metadata: { sentinel: "verifier-profile-secret" },
    };

    const props = buildAboutPageClientProps({
        circle: makeCircle("user"),
        viewerDid: "did:example:outsider",
        verifiedContributions: [
            {
                task,
                circle: contributionCircle,
                permissions: {
                    canModerate: false,
                    canReview: false,
                    canAssign: false,
                    canResolve: false,
                    canComment: true,
                },
            },
        ],
        verifiedContributionPublicCount: 1,
        fundingPreviewAsks: [fundingAsk],
        fundingPanelVisibility: "visible",
        upcomingShiftTasks: [shift],
        upcomingShiftsVisibility: "visible",
        canCreateFundingAsk: true,
        showFundingPanel: true,
        showUpcomingShiftsPanel: true,
        proofOfHumanitySummary: {
            realPersonCount: 1,
            metInRealLifeCount: 0,
            totalActiveCount: 1,
            verifications: [verification],
            viewerVerification: verification,
            canCurrentViewerVerify: true,
            isOwnProfile: false,
        },
    });

    const serialized = JSON.parse(JSON.stringify(props));
    assertForbiddenDataAbsent(serialized);
    assert.equal(props.verifiedContributions[0].dtoKind, "client-contribution");
    assert.equal(props.fundingPreviewAsks[0].dtoKind, "client-funding-preview");
    assert.equal(props.upcomingShiftTasks[0].dtoKind, "client-upcoming-shift");
    assert.equal(props.proofOfHumanitySummary?.dtoKind, "client-humanity-verification-summary");
    assert.equal(props.proofOfHumanitySummary?.verifications[0].verifier?.dtoKind, "client-verifier-display");
    assert.equal(Object.hasOwn(props.proofOfHumanitySummary?.verifications[0] ?? {}, "verifierDid"), false);
});

test("serialized-boundary regression guard rejects a raw Circle added beside safe props", () => {
    const safe = buildAboutPageClientProps({
        circle: makeCircle("circle"),
        fundingPanelVisibility: "sign_in",
        upcomingShiftsVisibility: "sign_in",
    });
    assert.throws(() => assertForbiddenDataAbsent({ ...safe, accidentalRawCircle: makeCircle("circle") }));
});
