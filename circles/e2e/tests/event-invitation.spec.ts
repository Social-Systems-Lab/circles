/**
 * Accepting an invitation to an event.
 *
 * An invitee arrives at the event from the invitation notification, chooses to attend, and confirms in
 * the RSVP dialog. Once the RSVP is saved the dialog has to get out of the way.
 *
 * The event is private and the invitee is not a member of the hosting circle, so the invitation is the
 * only reason they can see it. The invitation row has the shape `inviteUsersToEvent`
 * (src/lib/data/event.ts) writes.
 */

import { getDefaultModules } from "@/lib/data/constants";
import { expect, test } from "../support/fixtures";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

test.describe("an invited user accepting an event invitation", () => {
    test("sees the RSVP dialog close once they confirm", async ({ page, db, seed, signInAs }) => {
        const host = await seed.user();
        const invitee = await seed.user();
        // Circles do not have events by default, and the middleware 404s a module that is not enabled.
        const circle = await seed.circleOwnedBy(host, {
            enabledModules: [...getDefaultModules("circle"), "events"],
        });

        const startAt = new Date(Date.now() + 7 * DAY_MS);
        const event = await seed.insert("events", {
            circleId: circle.id,
            createdBy: host.did,
            createdAt: new Date(),
            title: "Community Potluck",
            description: "Seeded by the end-to-end test suite.",
            stage: "open",
            visibility: "private",
            userGroups: [],
            startAt,
            endAt: new Date(startAt.getTime() + HOUR_MS),
        });
        const eventId = event._id.toString();
        await seed.insert("eventInvitations", {
            eventId,
            circleId: circle.id,
            userDid: invitee.did,
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        await signInAs(invitee);

        try {
            await page.goto(`/circles/${circle.handle}/events/${eventId}`);
            await page.getByRole("button", { name: "Attend", exact: true }).click();

            const dialog = page.getByRole("dialog", { name: "RSVP: I'm going" });
            await expect(dialog).toBeVisible();

            await dialog.getByRole("button", { name: "Confirm" }).click();

            await expect(dialog).toBeHidden();
            // The dialog closing only counts if it closed because the RSVP went through.
            await expect(page.getByText("Attending", { exact: true })).toBeVisible();
        } finally {
            // The RSVP is written by the application, not the seeder, so the seeder cannot remove it.
            await db.collection("eventRsvps").deleteMany({ eventId });
        }
    });
});
