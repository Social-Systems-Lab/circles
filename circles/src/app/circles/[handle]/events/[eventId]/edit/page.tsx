// circles/[handle]/events/[eventId]/edit/page.tsx
import { getCircleByHandle } from "@/lib/data/circle";
import { notFound } from "next/navigation";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getEventAction } from "@/app/circles/[handle]/events/actions";
import EventForm from "@/components/modules/events/event-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type PageProps = {
    params: Promise<{ handle: string; eventId: string }>;
};

export default async function EditEventPage(props: PageProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);
    if (!circle) {
        notFound();
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        notFound();
    }

    const event = await getEventAction(circle.handle!, params.eventId);
    if (!event) {
        notFound();
    }

    const isAuthor = userDid === event.createdBy;
    const canModerate = await isAuthorized(userDid, circle._id as string, features.events.moderate);
    const canEdit = isAuthor || canModerate;
    if (!canEdit) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to edit this event.</p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circle.handle}/events/${params.eventId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Event
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circle.handle}/events/${params.eventId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Event
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Edit Event</h1>
            </div>

            <div className="p-4">
                <EventForm circleHandle={circle.handle!} event={event} />
            </div>
        </div>
    );
}
