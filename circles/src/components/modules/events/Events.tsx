// components/modules/events/Events.tsx
"use server";

import { getEventsAction } from "@/app/circles/[handle]/events/actions";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getCircleByHandle } from "@/lib/data/circle";
import CalendarView from "./calendar";
import Link from "next/link";
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
                <p className="text-gray-600">You don't have permission to view events in this circle.</p>
            </div>
        );
    }

    const canCreateEvents = await isAuthorized(userDid, circle._id!.toString(), features.events.create);

    const { events } = await getEventsAction(circle.handle!, undefined);

    return (
        <div className="space-y-4 p-2 md:p-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Events</h1>
                {canCreateEvents && (
                    <Link
                        href={`/circles/${circle.handle}/events/create`}
                        className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        Create Event
                    </Link>
                )}
            </div>

            <CalendarView circleHandle={circle.handle!} events={events} />
        </div>
    );
}
