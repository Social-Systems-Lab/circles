// components/modules/events/Events.tsx
"use server";

import { getEventsAction } from "@/app/circles/[handle]/events/actions";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import EventsTabs from "./events-tabs";
import { Circle } from "@/models/models";

type Props = {
    circle: Circle;
};

export default async function EventsModule({ circle }: Props) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        // Not authenticated - follow Tasks pattern: show nothing or a simple message
        return (
            <div className="p-4">
                <h2 className="mb-2 text-xl font-semibold">Events</h2>
                <p className="text-gray-600">Please sign in to view events.</p>
            </div>
        );
    }

    const canViewEvents = await isAuthorized(userDid, circle._id!.toString(), features.events.view);
    if (!canViewEvents) {
        return (
            <div className="p-6 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to view events in this circle.</p>
            </div>
        );
    }

    const canCreateEvents = await isAuthorized(userDid, circle._id!.toString(), features.events.create);

    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);

    const { events } = await getEventsAction(
        circle.handle!,
        { from: today.toISOString(), to: nextYear.toISOString() },
        true,
        true
    );

    return (
        <div className="space-y-4 p-2 md:p-4">
            <EventsTabs circle={circle} events={events} canCreate={canCreateEvents} />
        </div>
    );
}
