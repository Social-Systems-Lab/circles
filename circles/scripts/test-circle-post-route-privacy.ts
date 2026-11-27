// Run against a loopback app connected to a disposable circles_stage1a_test_* database.
// Set CIRCLE_ROUTE_TEST_ORIGIN, MONGODB_URI, CIRCLES_MONGODB_DATABASE, and CIRCLES_JWT_SECRET.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { MongoClient, ObjectId } from "mongodb";
import { COMMUNITY_GUIDELINE_RULE_IDS } from "../src/lib/community-guidelines";
import { getDefaultAccessRules } from "../src/lib/data/constants";
import { ONBOARDING_STEPS } from "../src/models/models";

const origin = new URL(process.env.CIRCLE_ROUTE_TEST_ORIGIN ?? "");
const mongoUrl = new URL(process.env.MONGODB_URI ?? "");
const database = process.env.CIRCLES_MONGODB_DATABASE ?? "";
const secret = process.env.CIRCLES_JWT_SECRET;
const loopback = ["localhost", "127.0.0.1", "[::1]"];

assert.ok(["http:", "https:"].includes(origin.protocol) && loopback.includes(origin.hostname));
assert.ok(mongoUrl.protocol === "mongodb:" && loopback.includes(mongoUrl.hostname));
assert.match(database, /^circles_stage1a_test_[a-z0-9_-]+$/i);
assert.ok(secret, "Set the disposable application's JWT secret");

const suffix = randomUUID().slice(0, 8);
const marker = (field: string) => `DENY_${suffix}_${field}`;
const builtInRules = getDefaultAccessRules();
const authorDid = `did:fixture:author-${suffix}`;
const memberDid = `did:fixture:member-${suffix}`;
const outsiderDid = `did:fixture:outsider-${suffix}`;
const deniedMarkers = [
    marker("EMAIL"),
    marker("ACCOUNT"),
    marker("OFFER"),
    marker("METADATA"),
    marker("LOCATION"),
    marker("AUTHOR_STREET"),
    marker("AUTHOR_PICTURE"),
    marker("FEED_EXTRA"),
    marker("OTHER_MODULE_RULE"),
];
const authorStreet = marker("AUTHOR_STREET");
const authorPicture = marker("AUTHOR_PICTURE");

const client = new MongoClient(mongoUrl.toString(), { serverSelectionTimeoutMS: 2000 });
const db = client.db(database);
const fixtures: Array<{
    name: string;
    handle: string;
    post: string;
    body: string;
    communityPost: string;
    restrictedPost?: string;
}> = [];
const failures: string[] = [];
const check = (condition: boolean, message: string) => {
    if (!condition) failures.push(message);
};

try {
    const defaultCircle = new ObjectId();
    const server = await db.collection("serverSettings").updateOne(
        {},
        {
            $setOnInsert: {
                defaultCircleId: defaultCircle.toHexString(),
                did: "did:fixture:server",
                name: "Route privacy fixtures",
            },
        },
        { upsert: true },
    );
    if (server.upsertedCount) {
        await db.collection("circles").insertOne({
            _id: defaultCircle,
            name: "Route privacy fixtures",
            handle: "default",
            circleType: "circle",
        });
    }

    await db.collection("circles").insertMany(
        [authorDid, memberDid, outsiderDid].map((did, index) => ({
            did,
            handle: `route-privacy-user-${suffix}-${index}`,
            name: `Fixture user ${index}`,
            circleType: "user",
            isMember: true,
            isVerified: true,
            isEmailVerified: true,
            description: "Fixture introduction",
            completedOnboardingSteps: ONBOARDING_STEPS,
            picture: { url: "/images/default-user-picture.png", privateMetadata: authorPicture },
            location: { precision: 1, country: "Fixture country", region: "Fixture region", street: authorStreet },
            communityGuidelinesAcceptance: Object.fromEntries(
                COMMUNITY_GUIDELINE_RULE_IDS.map((id) => [id, { accepted: true, acceptedAt: new Date() }]),
            ),
        })),
    );

    for (const name of ["public", "restricted", "draft", "secret"]) {
        const circle = new ObjectId();
        const feed = new ObjectId();
        const communityFeed = new ObjectId();
        const post = new ObjectId();
        const communityPost = new ObjectId();
        const comment = new ObjectId();
        const handle = `route-privacy-${name}-${suffix}`;
        const body = `Visible post ${name} ${suffix}`;
        const restricted = name === "restricted";
        await db.collection("circles").insertOne({
            _id: circle,
            name: `Fixture ${name} circle ${suffix}`,
            handle,
            circleType: "circle",
            createdBy: authorDid,
            publishStatus: name === "draft" ? "draft" : "published",
            visibility: name === "secret" ? "secret" : "public",
            enabledModules: ["home", "feed", "community"],
            showAdminsPublicly: false,
            email: marker("EMAIL"),
            passwordResetToken: marker("ACCOUNT"),
            metadata: { test: marker("METADATA") },
            location: { precision: 1, region: "Fixture region", street: marker("LOCATION") },
            offers: { visibility: "private", text: marker("OFFER") },
            accessRules: {
                ...builtInRules,
                feed: { ...builtInRules.feed, view: restricted ? ["members"] : ["everyone"] },
                community: { ...builtInRules.community, view: restricted ? ["members"] : ["everyone"] },
                settings: { view: [marker("OTHER_MODULE_RULE")] },
            },
        });
        await db.collection("members").insertMany([
            { circleId: circle.toHexString(), userDid: authorDid, userGroups: ["admins", "members"] },
            { circleId: circle.toHexString(), userDid: memberDid, userGroups: ["members"] },
        ]);
        await db.collection("feeds").insertMany([
            {
                _id: feed,
                circleId: circle.toHexString(),
                handle: "default",
                name: "Fixture Noticeboard",
                createdAt: new Date(),
                userGroups: ["everyone"],
                extraField: marker("FEED_EXTRA"),
            },
            {
                _id: communityFeed,
                circleId: circle.toHexString(),
                handle: "community",
                name: "Fixture Community",
                createdAt: new Date(),
                userGroups: ["everyone"],
                extraField: marker("FEED_EXTRA"),
            },
        ]);
        const basePost = {
            createdBy: authorDid,
            createdAt: new Date(),
            reactions: {},
            comments: 1,
            userGroups: ["everyone"],
        };
        await db.collection("posts").insertMany([
            {
                ...basePost,
                _id: post,
                feedId: feed.toHexString(),
                content: body,
                postType: "post",
                highlightedCommentId: comment.toHexString(),
            },
            {
                ...basePost,
                _id: communityPost,
                feedId: communityFeed.toHexString(),
                content: `Visible community ${name} ${suffix}`,
                postType: "community",
            },
        ]);
        await db.collection("comments").insertOne({
            _id: comment,
            postId: post.toHexString(),
            parentCommentId: null,
            createdBy: authorDid,
            createdAt: new Date(),
            content: `Visible comment ${name} ${suffix}`,
            reactions: {},
            replies: 0,
        });
        const fixture: (typeof fixtures)[number] = {
            name,
            handle,
            post: post.toHexString(),
            body,
            communityPost: communityPost.toHexString(),
        };
        if (name === "public") {
            const restrictedPost = await db.collection("posts").insertOne({
                ...basePost,
                feedId: feed.toHexString(),
                content: `Members-only fixture ${suffix}`,
                postType: "post",
                userGroups: ["members"],
            });
            fixture.restrictedPost = restrictedPost.insertedId.toHexString();
        }
        fixtures.push(fixture);
    }

    const sign = async (did: string) =>
        new SignJWT({ userDid: did })
            .setProtectedHeader({ alg: "HS256" })
            .setExpirationTime("5m")
            .sign(new TextEncoder().encode(secret));
    const viewerCookies = {
        guest: "",
        outsider: `token=${await sign(outsiderDid)}`,
        member: `token=${await sign(memberDid)}`,
        owner: `token=${await sign(authorDid)}`,
    };

    const delegatedCircle = new ObjectId();
    const editorHandle = `route-privacy-editors-${suffix}`;
    const editorMarker = marker("EDITORS_RULE");
    const officialEmail = `${marker("OFFICIAL_EMAIL")}@example.invalid`;
    const editorRules = { edit_about: ["admins", editorMarker] };
    await db.collection("circles").insertOne({
        _id: delegatedCircle,
        handle: editorHandle,
        circleType: "circle",
        name: "Fixture delegated settings",
        createdBy: authorDid,
        publishStatus: "published",
        visibility: "public",
        enabledModules: ["home", "settings"],
        accessRules: { settings: editorRules },
        officialEmail,
        location: { precision: 1, street: marker("LOCATION") },
        metadata: { test: marker("METADATA") },
        passwordResetToken: marker("ACCOUNT"),
    });
    await db.collection("members").insertMany([
        { circleId: delegatedCircle.toHexString(), userDid: authorDid, userGroups: ["admins"] },
        { circleId: delegatedCircle.toHexString(), userDid: memberDid, userGroups: ["members", editorMarker] },
        { circleId: delegatedCircle.toHexString(), userDid: outsiderDid, userGroups: ["members"] },
    ]);

    const editorRoutes = {
        about: "About Settings",
        presence: "Offers and needs",
        "access-rules": "Access Rules Settings",
    };
    async function checkEditorRoutes(state: string, allowedPages: string[], cookie: string) {
        for (const [page, title] of Object.entries(editorRoutes)) {
            for (const rsc of [false, true]) {
                const path = `/circles/${editorHandle}/settings/${page}`;
                const label = `${state} ${page} ${rsc ? "RSC" : "HTML"}`;
                const response = await fetch(new URL(path, origin), {
                    headers: { ...(cookie && { cookie }), ...(rsc && { RSC: "1" }) },
                    redirect: "manual",
                    signal: AbortSignal.timeout(10000),
                });
                const body = await response.text();
                const allowed = allowedPages.includes(page);
                check(body.includes(title) === allowed, `${label} had unexpected editor access (${response.status})`);
                if (allowed) {
                    check(response.status === 200, `${label} had unexpected status ${response.status}`);
                    check(
                        response.headers.get("content-type")?.includes(rsc ? "text/x-component" : "text/html") === true,
                        `${label} had an unexpected content type`,
                    );
                }
                if (state !== "administrator") {
                    for (const field of [editorMarker, officialEmail, marker("LOCATION"), marker("METADATA"), marker("ACCOUNT")]) {
                        check(!body.includes(field), `${label} exposed a restricted value`);
                    }
                    check(!body.includes("Organization Claim"), `${label} exposed administrative controls`);
                }
            }
        }
    }

    await checkEditorRoutes("delegated editor", ["about", "presence"], viewerCookies.member);
    await checkEditorRoutes("ordinary member", [], viewerCookies.outsider);
    await checkEditorRoutes("anonymous visitor", [], viewerCookies.guest);
    await checkEditorRoutes("administrator", Object.keys(editorRoutes), viewerCookies.owner);
    await db.collection("circles").updateOne({ _id: delegatedCircle }, { $set: { "accessRules.settings.view": [] } });
    await checkEditorRoutes("explicit Settings denial", [], viewerCookies.member);
    await db.collection("circles").updateOne(
        { _id: delegatedCircle },
        { $set: { accessRules: { settings: editorRules }, publishStatus: "draft" } },
    );
    await checkEditorRoutes("unpublished circle non-creator", [], viewerCookies.member);
    await db.collection("circles").updateOne(
        { _id: delegatedCircle },
        { $set: { publishStatus: "published", visibility: "secret" } },
    );
    await db.collection("members").deleteOne({ circleId: delegatedCircle.toHexString(), userDid: outsiderDid });
    await checkEditorRoutes("Secret Circle outsider", [], viewerCookies.outsider);
    await checkEditorRoutes("Secret Circle editor", ["about", "presence"], viewerCookies.member);

    for (const fixture of fixtures) {
        const { name, handle, post, body, communityPost, restrictedPost } = fixture;
        const routes = [
            { path: `/circles/${handle}/community`, marker: "hasPostPermission" },
            { path: `/circles/${handle}/post/${post}`, marker: body, hasComment: true },
            { path: `/circles/${handle}/post/${communityPost}`, marker: `Visible community ${name} ${suffix}` },
            ...(restrictedPost
                ? [
                      {
                          path: `/circles/${handle}/post/${restrictedPost}`,
                          marker: `Members-only fixture ${suffix}`,
                          postOnly: true,
                      },
                  ]
                : []),
        ];
        for (const [viewer, cookie] of Object.entries(viewerCookies)) {
            const canReadCircle = name === "public" || viewer === "owner" || (name !== "draft" && viewer === "member");
            for (const route of routes) {
                const allowed = "postOnly" in route ? viewer === "member" || viewer === "owner" : canReadCircle;
                for (const rsc of [false, true]) {
                    const label = `${name} ${viewer} ${rsc ? "RSC" : "HTML"} ${route.path}`;
                    const response = await fetch(new URL(route.path, origin), {
                        headers: { ...(cookie && { cookie }), ...(rsc && { RSC: "1" }) },
                        redirect: "manual",
                        signal: AbortSignal.timeout(10000),
                    });
                    const text = await response.text();
                    const leaks = deniedMarkers
                        .filter((value) => text.includes(value))
                        .map((value) => value.replace(`DENY_${suffix}_`, ""));
                    check(!leaks.length, `${label} exposed ${leaks.join(", ")}`);
                    check(
                        text.includes(route.marker) === allowed,
                        `${label} had unexpected content access (${response.status})`,
                    );
                    if (allowed) {
                        check(response.status === 200, `${label} had unexpected status ${response.status}`);
                        if ("hasComment" in route) {
                            check(
                                text.includes(`Visible comment ${name} ${suffix}`),
                                `${label} lost the visible comment`,
                            );
                        }
                        check(
                            response.headers.get("content-type")?.includes(rsc ? "text/x-component" : "text/html") ===
                                true,
                            `${label} had an unexpected content type`,
                        );
                    }
                    if (!canReadCircle) {
                        check(
                            !text.includes(`Fixture ${name} circle ${suffix}`),
                            `${label} disclosed a protected circle name`,
                        );
                    }
                }
            }
        }
    }
} finally {
    await client.close();
}

assert.equal(failures.length, 0, failures.join("\n"));
console.log(
    `Community, post and Settings HTML/RSC privacy checks passed (${suffix}).`,
);
