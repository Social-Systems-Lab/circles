/**
 * Deterministic local performance fixture for Circles.
 *
 * Dry-run:
 *   bun scripts/seed-performance-fixture.ts
 *
 * Apply:
 *   bun scripts/seed-performance-fixture.ts --apply
 *
 * Cleanup generated docs:
 *   bun scripts/seed-performance-fixture.ts --cleanup --apply
 *
 * Optional counts:
 *   bun scripts/seed-performance-fixture.ts --users=240 --circles=60 --posts=150 --apply
 */

import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI =
    process.env.MONGODB_URI ||
    `mongodb://${process.env.MONGO_ROOT_USERNAME || "admin"}:${process.env.MONGO_ROOT_PASSWORD || "password"}@${process.env.MONGO_HOST || "127.0.0.1"}:${process.env.MONGO_PORT || "27017"}`;

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const cleanup = args.has("--cleanup");
const mode = apply ? "apply" : "dry-run";
const seedTag = getArg("tag", "perf-sim-v1");
const userCount = getNumberArg("users", 240);
const circleCount = getNumberArg("circles", 60);
const postCount = getNumberArg("posts", 150);

const defaultUserGroups = [
    {
        name: "Admins",
        handle: "admins",
        title: "Admin",
        description: "Administrators of the circle",
        accessLevel: 100,
        readOnly: true,
    },
    {
        name: "Moderators",
        handle: "moderators",
        title: "Moderator",
        description: "Moderators of the circle",
        accessLevel: 200,
        readOnly: true,
    },
    {
        name: "Followers",
        handle: "members",
        title: "Follower",
        description: "Follower of the circle",
        accessLevel: 300,
        readOnly: true,
    },
];

const circleModules = [
    "home",
    "feed",
    "followers",
    "communities",
    "discussions",
    "events",
    "goals",
    "tasks",
    "issues",
    "proposals",
    "settings",
];
const userModules = ["home", "feed", "followers", "communities", "settings"];

const accessRules = {
    general: {
        edit_same_level_user_groups: ["admins"],
        edit_lower_user_groups: ["admins", "moderators"],
        remove_same_level_members: ["admins"],
        remove_lower_members: ["admins", "moderators"],
        manage_membership_requests: ["admins", "moderators"],
    },
    home: { view: ["admins", "moderators", "members", "everyone"] },
    feed: {
        view: ["admins", "moderators", "members", "everyone"],
        post: ["admins", "moderators"],
        comment: ["admins", "moderators", "members", "everyone"],
        moderate: ["admins", "moderators"],
    },
    followers: { view: ["admins", "moderators", "members", "everyone"] },
    communities: {
        view: ["admins", "moderators", "members", "everyone"],
        create: ["admins", "moderators", "members"],
        delete: ["admins"],
    },
    discussions: {
        view: ["admins", "moderators", "members", "everyone"],
        create: ["admins", "moderators", "members"],
        comment: ["admins", "moderators", "members", "everyone"],
        moderate: ["admins", "moderators"],
    },
    events: {
        view: ["admins", "moderators", "members", "everyone"],
        create: ["admins", "moderators"],
        update: ["admins", "moderators"],
        review: ["admins", "moderators"],
        moderate: ["admins"],
        comment: ["admins", "moderators", "members", "everyone"],
        rsvp: ["admins", "moderators", "members", "everyone"],
    },
    goals: {
        view: ["admins", "moderators", "members", "everyone"],
        create: ["admins", "moderators"],
        update: ["admins", "moderators"],
        review: ["admins", "moderators"],
        resolve: ["admins", "moderators"],
        moderate: ["admins"],
        comment: ["admins", "moderators", "members", "everyone"],
        rank: ["admins", "moderators", "members"],
        follow: ["admins", "moderators", "members", "everyone"],
    },
    tasks: {
        view: ["admins", "moderators", "members", "everyone"],
        create: ["admins", "moderators"],
        update: ["admins", "moderators"],
        review: ["admins", "moderators"],
        assign: ["admins", "moderators"],
        resolve: ["admins", "moderators"],
        moderate: ["admins"],
        comment: ["admins", "moderators", "members", "everyone"],
        rank: ["admins", "moderators", "members"],
    },
    issues: {
        view: ["admins", "moderators", "members", "everyone"],
        create: ["admins", "moderators", "members"],
        update: ["admins", "moderators"],
        review: ["admins", "moderators"],
        assign: ["admins", "moderators"],
        resolve: ["admins", "moderators"],
        moderate: ["admins"],
        comment: ["admins", "moderators", "members", "everyone"],
        rank: ["admins", "moderators", "members"],
    },
    proposals: {
        view: ["admins", "moderators", "members", "everyone"],
        create: ["admins", "moderators", "members"],
        review: ["admins", "moderators"],
        vote: ["admins", "moderators", "members"],
        resolve: ["admins", "moderators"],
        moderate: ["admins"],
        rank: ["admins", "moderators", "members"],
    },
    settings: {
        view: ["admins"],
        edit_about: ["admins"],
        edit_user_groups: ["admins"],
        edit_pages: ["admins"],
        edit_access_rules: ["admins"],
        edit_causes_and_skills: ["admins"],
        edit_questionnaire: ["admins"],
        edit_critical_settings: ["admins"],
    },
};

const locations = [
    ["Cape Town", "Western Cape", "South Africa", 18.4241, -33.9249],
    ["Stockholm", "Stockholm County", "Sweden", 18.0686, 59.3293],
    ["Nairobi", "Nairobi County", "Kenya", 36.8219, -1.2921],
    ["Berlin", "Berlin", "Germany", 13.405, 52.52],
    ["Sao Paulo", "Sao Paulo", "Brazil", -46.6333, -23.5505],
    ["New York", "New York", "United States", -74.006, 40.7128],
    ["Tokyo", "Tokyo", "Japan", 139.6503, 35.6762],
    ["Melbourne", "Victoria", "Australia", 144.9631, -37.8136],
    ["Barcelona", "Catalonia", "Spain", 2.1734, 41.3851],
    ["Montreal", "Quebec", "Canada", -73.5673, 45.5017],
] as const;

const topics = [
    "urban gardens",
    "repair cafes",
    "food rescue",
    "mutual aid",
    "public learning",
    "water stewardship",
    "youth labs",
    "climate resilience",
];

function getArg(name: string, fallback: string): string {
    const prefix = `--${name}=`;
    return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function getNumberArg(name: string, fallback: number): number {
    const value = Number(getArg(name, String(fallback)));
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

function pad(value: number): string {
    return String(value).padStart(3, "0");
}

function seededDid(kind: "user" | "circle", index: number): string {
    return `did:kamooni:${seedTag}:${kind}:${pad(index)}`;
}

function localImage(path: string) {
    return { originalName: path.split("/").pop(), fileName: path.split("/").pop(), url: path };
}

function media(name: string, path: string) {
    return { name, type: "image/png", fileInfo: localImage(path) };
}

function locationFor(index: number) {
    const [city, region, country, lng, lat] = locations[index % locations.length];
    return { precision: 5, city, region, country, lngLat: { lng, lat } };
}

function createdAt(index: number): Date {
    return new Date(Date.now() - index * 60 * 60 * 1000);
}

function userDoc(index: number) {
    const n = pad(index);
    return {
        did: seededDid("user", index),
        publicKey: `perf-public-key-${n}`,
        name: `Performance User ${n}`,
        email: `perf-user-${n}@example.invalid`,
        handle: `perf-user-${n}`,
        type: "user",
        circleType: "user",
        circleLevel: "top_level",
        publishStatus: "published",
        isPublic: true,
        isVerified: true,
        isMember: true,
        verificationStatus: "verified",
        accountStatus: "active",
        isEmailVerified: true,
        picture: localImage(`/images/cal/c${(index % 12) + 1}_${(index % 28) + 1}.png`),
        images: [media("Profile cover", index % 2 === 0 ? "/images/default-user-cover.png" : "/images/cover.png")],
        description: `Synthetic member for local performance testing, interested in ${topics[index % topics.length]}.`,
        content: `Performance fixture user ${n}.`,
        location: locationFor(index),
        causes: [`cause-${(index % 8) + 1}`],
        skills: [`skill-${(index % 10) + 1}`],
        userGroups: defaultUserGroups,
        enabledModules: userModules,
        accessRules,
        members: 0,
        questionnaire: [],
        createdAt: createdAt(index),
        completedOnboardingSteps: ["welcome", "terms", "member", "mission", "profile", "location", "sdgs", "final"],
        communityGuidelinesAcceptedAt: createdAt(index),
        metadata: { seedTag, fixtureType: "performance", fixtureKind: "user", fixtureIndex: index },
    };
}

function circleDoc(index: number, creatorDid: string) {
    const n = pad(index);
    const topic = topics[index % topics.length];
    return {
        did: seededDid("circle", index),
        name: `Performance Circle ${n}`,
        handle: `perf-circle-${n}`,
        circleType: "circle",
        circleLevel: "top_level",
        publishStatus: "published",
        isPublic: true,
        isVerified: true,
        isMember: true,
        showAdminsPublicly: true,
        picture: localImage(index % 2 === 0 ? "/images/circles-picture-small.png" : "/images/default-picture.png"),
        images: [
            media(
                "Circle cover",
                ["/images/cover.png", "/images/cover2.png", "/images/cover3.png", "/images/default-cover.png"][
                    index % 4
                ],
            ),
        ],
        description: `A synthetic global circle coordinating ${topic}.`,
        mission: `Coordinate ${topic} across neighborhoods and make activity visible at platform scale.`,
        content: `Fixture content for performance testing circle ${n}.`,
        location: locationFor(index + 3),
        causes: [`cause-${(index % 8) + 1}`, `cause-${((index + 3) % 8) + 1}`],
        skills: [`skill-${(index % 10) + 1}`, `skill-${((index + 5) % 10) + 1}`],
        userGroups: defaultUserGroups,
        enabledModules: circleModules,
        accessRules,
        members: 0,
        questionnaire: [],
        createdBy: creatorDid,
        createdAt: createdAt(index + 20),
        metadata: { seedTag, fixtureType: "performance", fixtureKind: "circle", fixtureIndex: index },
    };
}

function feedDoc(circleId: string, index: number) {
    return {
        name: "Circle Noticeboard",
        handle: "default",
        circleId,
        createdAt: createdAt(index + 40),
        userGroups: ["admins", "moderators", "members", "everyone"],
        metadata: { seedTag, fixtureType: "performance", fixtureKind: "feed", fixtureIndex: index },
    };
}

function postDoc(feedId: string, authorDid: string, index: number) {
    const topic = topics[index % topics.length];
    return {
        feedId,
        createdBy: authorDid,
        createdAt: createdAt(index),
        content: `Synthetic update ${pad(index)} about ${topic}. Includes enough text to exercise feed rendering, author lookups, timestamps, reactions, and media layout at a modest production-like volume.`,
        title: `Performance update ${pad(index)}`,
        reactions: { like: index % 17, celebrate: index % 7 },
        comments: index % 9,
        userGroups: ["everyone"],
        postType: "post",
        location: locationFor(index + 7),
        media:
            index % 3 === 0
                ? [
                      media(
                          "Post image",
                          ["/images/default-post-picture.png", "/images/cover2.png", "/images/cover3.png"][index % 3],
                      ),
                  ]
                : [],
        mentions: [],
        metadata: { seedTag, fixtureType: "performance", fixtureKind: "post", fixtureIndex: index },
    };
}

async function main() {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db("circles");
    const circles = db.collection("circles");
    const members = db.collection("members");
    const feeds = db.collection("feeds");
    const posts = db.collection("posts");

    if (cleanup) {
        const existingCircleIds = (
            await circles.find({ "metadata.seedTag": seedTag }).project({ _id: 1 }).toArray()
        ).map((doc) => doc._id.toString());
        const existingFeedIds = (await feeds.find({ "metadata.seedTag": seedTag }).project({ _id: 1 }).toArray()).map(
            (doc) => doc._id.toString(),
        );
        const cleanupPlan = {
            circles: existingCircleIds.length,
            members: await members.countDocuments({
                $or: [{ "metadata.seedTag": seedTag }, { circleId: { $in: existingCircleIds } }],
            }),
            feeds: existingFeedIds.length,
            posts: await posts.countDocuments({
                $or: [{ "metadata.seedTag": seedTag }, { feedId: { $in: existingFeedIds } }],
            }),
        };
        console.log(`[${mode}] cleanup tag=${seedTag}`);
        console.table(cleanupPlan);
        if (apply) {
            await posts.deleteMany({ $or: [{ "metadata.seedTag": seedTag }, { feedId: { $in: existingFeedIds } }] });
            await feeds.deleteMany({ "metadata.seedTag": seedTag });
            await members.deleteMany({
                $or: [{ "metadata.seedTag": seedTag }, { circleId: { $in: existingCircleIds } }],
            });
            await circles.deleteMany({ "metadata.seedTag": seedTag });
        }
        await client.close();
        return;
    }

    const existing = await circles.countDocuments({ "metadata.seedTag": seedTag });
    if (existing > 0) {
        console.log(`Found ${existing} existing generated circles/users for tag "${seedTag}".`);
        console.log("Run with --cleanup --apply before reseeding this tag.");
        await client.close();
        return;
    }

    const users = Array.from({ length: userCount }, (_, i) => userDoc(i + 1));
    const circleDrafts = Array.from({ length: circleCount }, (_, i) => circleDoc(i + 1, users[i % users.length].did));

    console.log(`[${mode}] seed tag=${seedTag}`);
    console.table({ users: users.length, circles: circleDrafts.length, feeds: circleDrafts.length, posts: postCount });

    if (!apply) {
        console.log("No documents were written. Re-run with --apply to create the fixture.");
        await client.close();
        return;
    }

    const userInsert = await circles.insertMany(users);
    const circleInsert = await circles.insertMany(circleDrafts);
    const circleIds = Object.values(circleInsert.insertedIds).map((id) => id.toString());
    const userDids = users.map((user) => user.did);
    const creatorMemberships = circleIds.map((circleId, i) => ({
        userDid: circleDrafts[i].createdBy,
        circleId,
        userGroups: ["admins", "moderators", "members"],
        joinedAt: createdAt(i + 10),
        metadata: { seedTag, fixtureType: "performance", fixtureKind: "member", fixtureIndex: i + 1 },
    }));
    const memberFanout = circleIds.flatMap((circleId, circleIndex) =>
        Array.from({ length: Math.min(18, userDids.length) }, (_, offset) => ({
            userDid: userDids[(circleIndex * 7 + offset) % userDids.length],
            circleId,
            userGroups: offset === 0 ? ["admins", "moderators", "members"] : ["members"],
            joinedAt: createdAt(circleIndex + offset + 15),
            metadata: {
                seedTag,
                fixtureType: "performance",
                fixtureKind: "member",
                fixtureIndex: circleIndex * 100 + offset,
            },
        })),
    );
    const dedupedMemberships = [...creatorMemberships, ...memberFanout].filter(
        (member, index, all) =>
            all.findIndex((m) => m.userDid === member.userDid && m.circleId === member.circleId) === index,
    );

    await members.insertMany(dedupedMemberships);
    const feedInsert = await feeds.insertMany(circleIds.map((circleId, i) => feedDoc(circleId, i + 1)));
    const feedIds = Object.values(feedInsert.insertedIds).map((id) => id.toString());
    await posts.insertMany(
        Array.from({ length: postCount }, (_, i) =>
            postDoc(feedIds[i % feedIds.length], userDids[i % userDids.length], i + 1),
        ),
    );

    const memberCounts = new Map<string, number>();
    for (const member of dedupedMemberships) {
        memberCounts.set(member.circleId, (memberCounts.get(member.circleId) ?? 0) + 1);
    }
    await Promise.all(
        circleIds.map((circleId) =>
            circles.updateOne({ _id: new ObjectId(circleId) }, { $set: { members: memberCounts.get(circleId) ?? 0 } }),
        ),
    );

    console.log("Created performance fixture:");
    console.table({
        users: userInsert.insertedCount,
        circles: circleInsert.insertedCount,
        memberships: dedupedMemberships.length,
        feeds: feedIds.length,
        posts: postCount,
    });

    await client.close();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
