// components/modules/events/Events.tsx
"use server";

import { getEventsAction } from "@/app/circles/[handle]/events/actions";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import EventsTabs from "./events-tabs";
import { Circle } from "@/models/models";
import { isPeerifyManagedIdentity } from "@/lib/peerify/artist-profile";

type Props = {
    circle: Circle;
};

export default async function EventsModule({ circle }: Props) {
    const userDid = await getAuthenticatedUserDid();
    const isPublicPeerifyManagedEvents = !userDid && isPeerifyManagedIdentity(circle);

    if (!userDid && !isPublicPeerifyManagedEvents) {
        return (
            <div className="p-4">
                <h2 className="mb-2 text-xl font-semibold">Events</h2>
                <p className="text-gray-600">Please sign in to view events.</p>
            </div>
        );
    }

    if (!isPublicPeerifyManagedEvents) {
        const canViewEvents = await isAuthorized(userDid, circle._id!.toString(), features.events.view);
        if (!canViewEvents) {
            return (
                <div className="p-6 text-center">
                    <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                    <p className="text-gray-600">You don&apos;t have permission to view events in this circle.</p>
                </div>
            );
        }
    }

    const canCreateEvents = userDid
        ? await isAuthorized(userDid, circle._id!.toString(), features.events.create)
        : false;

    const now = new Date();
    const lastYear = new Date(now);
    lastYear.setFullYear(now.getFullYear() - 1);
    const nextYear = new Date(now);
    nextYear.setFullYear(now.getFullYear() + 1);

    const { events } = await getEventsAction(
        circle.handle!,
        { from: lastYear.toISOString(), to: nextYear.toISOString() },
        true,
        true,
    );

    return (
        <div className="space-y-4 p-2 md:p-4">
            <EventsTabs circle={circle} events={events} canCreate={canCreateEvents} />
        </div>
    );
}
