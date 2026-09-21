/**
 * Data factories for e2e tests.
 *
 * Each test builds the state it needs instead of relying on whatever happens to be in the database, and
 * every document is stamped with the run id (see env.ts) and remembered, so a test cleans up after
 * itself and a crashed run can still be swept afterwards. Names, handles, emails and DIDs are unique per
 * document, which is what lets tests run in parallel against one database.
 *
 * Defaults come from the application's own constants rather than copies of them, so a change to the
 * default modules or access rules reaches the fixtures too.
 */

import crypto from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import {
    defaultUserGroups,
    defaultUserGroupsForUser,
    getDefaultAccessRules,
    getDefaultModules,
} from "@/lib/data/constants";
import { COMMUNITY_GUIDELINE_RULE_IDS } from "@/lib/community-guidelines";
import { getDefaultHeroImage } from "@/lib/default-heroes";
import { RUN_ID_FIELD } from "./env";

export type SeededUser = {
    _id: ObjectId;
    id: string;
    did: string;
    handle: string;
    name: string;
    email: string;
};

export type SeededCircle = {
    _id: ObjectId;
    id: string;
    handle: string;
    name: string;
};

type Document = Record<string, unknown>;

/**
 * A profile picture that is a real asset but is not one of the defaults.
 *
 * `hasRealProfileImage` (src/lib/profile-completion.ts) treats the two default images as "not set yet",
 * and an unset picture blocks posting, commenting and joining. This one counts as a completed profile,
 * and unlike an invented path it actually resolves, so pages render without broken images.
 */
const SEEDED_PROFILE_PICTURE = "/images/default-user-cover.png";

const acceptedCommunityGuidelines = (acceptedAt: Date) =>
    Object.fromEntries(COMMUNITY_GUIDELINE_RULE_IDS.map((id) => [id, { accepted: true, acceptedAt }]));

export class Seeder {
    private readonly created: { collection: string; _id: ObjectId }[] = [];

    constructor(
        private readonly db: Db,
        private readonly runId: string,
    ) {}

    /** A short token that makes every seeded handle, email and DID unique. */
    private token(): string {
        return crypto.randomBytes(4).toString("hex");
    }

    /**
     * Inserts a document, tagging it so it can be cleaned up, and remembers it for teardown.
     * Use this for collections without a dedicated factory.
     */
    async insert<T extends Document>(collection: string, document: T): Promise<T & { _id: ObjectId }> {
        const withId = { _id: new ObjectId(), ...document, [RUN_ID_FIELD]: this.runId } as T & { _id: ObjectId };
        await this.db.collection(collection).insertOne(withId);
        this.created.push({ collection, _id: withId._id });
        return withId;
    }

    /**
     * A user who can take part: email verified, profile complete, guidelines accepted.
     *
     * Override any of those to test the states that block participation, for example
     * `user({ isEmailVerified: false })`.
     */
    async user(overrides: Document = {}): Promise<SeededUser> {
        const token = this.token();
        const now = new Date();
        const handle = `e2e-user-${token}`;

        const document = await this.insert("circles", {
            did: crypto.randomBytes(32).toString("hex"),
            publicKey: `-----BEGIN RSA PUBLIC KEY-----\ne2e-${token}\n-----END RSA PUBLIC KEY-----\n`,
            name: `E2E User ${token}`,
            handle,
            email: `${handle}@e2e.invalid`,
            type: "user",
            circleType: "user",
            description: "Seeded by the end-to-end test suite.",
            picture: { url: SEEDED_PROFILE_PICTURE },
            images: [getDefaultHeroImage(handle)],
            userGroups: defaultUserGroupsForUser,
            accessRules: getDefaultAccessRules(),
            enabledModules: getDefaultModules("user"),
            questionnaire: [],
            isPublic: true,
            isEmailVerified: true,
            accountStatus: "active",
            verificationStatus: "unverified",
            communityGuidelinesAcceptance: acceptedCommunityGuidelines(now),
            createdAt: now,
            ...overrides,
        });

        return {
            _id: document._id,
            id: document._id.toString(),
            did: document.did as string,
            handle: document.handle as string,
            name: document.name as string,
            email: document.email as string,
        };
    }

    /** A user with the platform-wide admin flag set. */
    async adminUser(overrides: Document = {}): Promise<SeededUser> {
        return this.user({ isAdmin: true, ...overrides });
    }

    /** A published, publicly visible circle. */
    async circle(overrides: Document = {}): Promise<SeededCircle> {
        const token = this.token();
        const handle = `e2e-circle-${token}`;

        const document = await this.insert("circles", {
            name: `E2E Circle ${token}`,
            handle,
            description: "Seeded by the end-to-end test suite.",
            picture: { url: "/images/default-picture.png" },
            images: [getDefaultHeroImage(handle)],
            circleType: "circle",
            circleLevel: "top_level",
            userGroups: defaultUserGroups,
            accessRules: getDefaultAccessRules(),
            enabledModules: getDefaultModules("circle"),
            questionnaire: [],
            isPublic: true,
            showAdminsPublicly: false,
            publishStatus: "published",
            moderationStatus: "active",
            createdAt: new Date(),
            ...overrides,
        });

        return {
            _id: document._id,
            id: document._id.toString(),
            handle: document.handle as string,
            name: document.name as string,
        };
    }

    /** Adds `user` to `circle`. Defaults to the plain follower group. */
    async member(circle: SeededCircle, user: SeededUser, userGroups: string[] = ["members"]): Promise<void> {
        await this.insert("members", {
            userDid: user.did,
            circleId: circle.id,
            userGroups,
            joinedAt: new Date(),
        });
    }

    /** Creates a circle that `user` administers, which is what circle creation produces in the app. */
    async circleOwnedBy(user: SeededUser, overrides: Document = {}): Promise<SeededCircle> {
        const circle = await this.circle({ createdBy: user.did, ...overrides });
        await this.member(circle, user, ["admins"]);
        return circle;
    }

    /** Removes everything this seeder created, newest first so references disappear before their targets. */
    async cleanup(): Promise<void> {
        for (const { collection, _id } of [...this.created].reverse()) {
            await this.db.collection(collection).deleteOne({ _id });
        }
        this.created.length = 0;
    }
}
