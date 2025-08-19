// circles/[handle]/events/[eventId]/page.tsx
import { getCircleByHandle } from "@/lib/data/circle";
import { notFound } from "next/navigation";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getEventAction } from "@/app/circles/[handle]/events/actions";
import EventDetail from "@/components/modules/events/event-detail";

type PageProps = {
    params: Promise<{ handle: string; eventId: string }>;
};

export default async function EventDetailPage(props: PageProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);
    if (!circle) {
        notFound();
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        // Allow unauthenticated users only if events.view includes "everyone"
        const canView = await isAuthorized(undefined as unknown as string, circle._id as string, features.events.view);
        if (!canView) {
            notFound();
        }
    } else {
        const canView = await isAuthorized(userDid, circle._id as string, features.events.view);
        if (!canView) {
            notFound();
        }
    }

    const event = await getEventAction(circle.handle!, params.eventId);
    if (!event) {
        notFound();
    }

    // Basic edit permission (author or moderators)
    const canModerate = userDid ? await isAuthorized(userDid, circle._id as string, features.events.moderate) : false;
    const canEdit = canModerate || (userDid && userDid === event.createdBy);

    return <EventDetail circleHandle={circle.handle!} event={event} canEdit={!!canEdit} />;
}
