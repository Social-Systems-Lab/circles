// @ts-nocheck -- Bun's test globals are available at runtime but this project does not install Bun type declarations.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
    filterNotificationRecipientsWhoCanViewPost,
    shapeNotificationContent,
    shapeReminderNotificationContents,
    shapeStoredNotifications,
} from "./notification-content";

const privateFields = {
    email: "private@example.invalid",
    location: { street: "Private street", lngLat: { lat: 1, lng: 2 } },
    memberships: [{ circle: { name: "Private circle" } }],
    metadata: { bookingNote: "Private booking note" },
};

const person = () => ({
    _id: "person-id",
    did: "did:test:person",
    handle: "person",
    name: "Person",
    picture: { url: "/person.png", privateVariant: "secret" },
    circleType: "user",
    ...privateFields,
});

const circleWithoutDid = (handle: string) => ({
    _id: `${handle}-id`,
    handle,
    name: handle === "artist" ? "Artist" : handle === "venue" ? "Venue" : "Group",
    picture: { url: `/${handle}.png`, originalName: `${handle}.png`, privateVariant: "secret" },
    circleType: "circle",
    accessRules: { feed: { view: ["admins"] } },
    ...privateFields,
});

const identityOf = (value: ReturnType<typeof person> | ReturnType<typeof circleWithoutDid>) => ({
    _id: value._id,
    ...("did" in value && value.did ? { did: value.did } : {}),
    handle: value.handle,
    name: value.name,
    picture: {
        ...("originalName" in value.picture && value.picture.originalName
            ? { originalName: value.picture.originalName }
            : {}),
        url: value.picture.url,
    },
    circleType: value.circleType,
});

describe("notification content containment", () => {
    test("keeps only identity fields for people and realistic artist, venue and group circles without DIDs", () => {
        const artist = circleWithoutDid("artist");
        const venue = circleWithoutDid("venue");
        const group = circleWithoutDid("group");
        const shaped = shapeNotificationContent({
            user: person(),
            circle: artist,
            artistCircle: artist,
            targetParentCircle: venue,
            subject: group,
            body: "Artist applied to Venue",
        }) as any;

        expect(shaped.user).toEqual(identityOf(person()));
        expect(shaped.circle).toEqual(identityOf(artist));
        expect(shaped.artistCircle).toEqual(identityOf(artist));
        expect(shaped.targetParentCircle).toEqual(identityOf(venue));
        expect(shaped.subject).toEqual(identityOf(group));
        expect(JSON.stringify(shaped)).not.toContain("private@example.invalid");
        expect(JSON.stringify(shaped)).not.toContain("Private street");
        expect(JSON.stringify(shaped)).not.toContain("Private booking note");
    });

    test("recursively sanitizes deeply nested arrays and safely drops unknown fields and objects", () => {
        const shaped = shapeNotificationContent({
            user: [[person(), { ...person(), did: "did:test:second" }]],
            post: [[{ _id: "post-1", createdBy: "did:test:author", content: "secret body", private: privateFields }]],
            body: "Safe body",
            unknownScalar: "drop me",
            unknownObject: { nested: [[person()]] },
            url: { malicious: "not a scalar URL" },
        }) as any;

        expect(shaped.user[0][0]).toEqual(identityOf(person()));
        expect(shaped.post).toEqual([[{ _id: "post-1", createdBy: "did:test:author" }]]);
        expect(shaped).toEqual({ user: shaped.user, post: shaped.post, body: "Safe body" });
    });

    test("preserves the minimum fields used by bell text, buttons and links", () => {
        const shaped = shapeNotificationContent({
            circle: circleWithoutDid("venue"),
            user: person(),
            post: {
                _id: "post-1",
                postType: "discussion",
                parentItemType: "task",
                parentItemId: "task-1",
                content: "private post text",
            },
            postId: "post-1",
            taskId: "task-1",
            taskTitle: "Legitimate task",
            eventId: "event-1",
            eventName: "Legitimate event",
            invitationMessage: "Please join",
            roomId: "room-1",
            topicId: "topic-1",
            topicTitle: "Topic",
            messageId: "message-1",
            messagePreview: "Telegram preview",
            url: "/chat/room-1?topic=topic-1",
            body: "Visible notification text",
        }) as any;

        expect(shaped.circle.handle).toBe("venue");
        expect(shaped.post).toEqual({
            _id: "post-1",
            postType: "discussion",
            parentItemType: "task",
            parentItemId: "task-1",
        });
        expect(shaped).toMatchObject({
            postId: "post-1",
            taskId: "task-1",
            eventId: "event-1",
            roomId: "room-1",
            topicId: "topic-1",
            messageId: "message-1",
            url: "/chat/room-1?topic=topic-1",
            body: "Visible notification text",
        });
    });

    test("sanitizes historical browser reads and reminder-email template inputs without changing stored records", () => {
        const historical = [{ _id: "n1", content: { user: person(), circle: circleWithoutDid("artist"), body: "Hi" } }];
        const reads = shapeStoredNotifications(historical);
        const reminders = shapeReminderNotificationContents(historical);

        expect(reads[0]).not.toBe(historical[0]);
        expect(reads[0].content).toEqual(reminders[0]);
        expect((historical[0].content.user as any).email).toBe("private@example.invalid");
        expect(JSON.stringify(reads)).not.toContain("private@example.invalid");
        expect(JSON.stringify(reminders)).not.toContain("private@example.invalid");
    });
});

test("mention recipients are filtered through the supplied canonical post-read policy", async () => {
    const recipients = [{ did: "did:test:allowed" }, { did: "did:test:restricted" }];
    const calls: string[] = [];
    const allowed = await filterNotificationRecipientsWhoCanViewPost({ _id: "post-1" }, recipients, async (_, did) => {
        calls.push(did!);
        return did === "did:test:allowed";
    });

    expect(calls).toEqual(["did:test:allowed", "did:test:restricted"]);
    expect(allowed).toEqual([{ did: "did:test:allowed" }]);
});

test("storage, historical reads, reminder email, post mentions and comment mentions use the containment helpers", () => {
    const notifications = readFileSync("src/lib/data/notifications.ts", "utf8");
    const adminActions = readFileSync("src/components/modules/admin/actions.ts", "utf8");

    expect(notifications).toMatch(/shapeNotificationContent\(\{[\s\S]*body:/);
    expect(notifications).toContain("return shapeStoredNotifications(notifications)");
    expect(adminActions).toContain("notifications: shapeReminderNotificationContents(unreadNotifications)");
    expect(notifications.match(/filterNotificationRecipientsWhoCanViewPost\(/g)).toHaveLength(2);
    expect(notifications.match(/canUserViewPost,/g)).toHaveLength(3);
});
