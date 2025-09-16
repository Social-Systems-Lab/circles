// circles/[handle]/events/[eventId]/page.tsx
import { getCircleByHandle } from "@/lib/data/circle";
import { notFound } from "next/navigation";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getEventAction } from "@/app/circles/[handle]/events/actions";
import EventDetail from "@/components/modules/events/event-detail";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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

    // Permissions
    const canModerate = userDid ? await isAuthorized(userDid, circle._id as string, features.events.moderate) : false;
    const canReview = userDid ? await isAuthorized(userDid, circle._id as string, features.events.review) : false;
    const isAuthor = !!userDid && userDid === event.createdBy;
    const canEdit = canModerate || isAuthor;

    return (
        <div className="formatted flex w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circle.handle}/events`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Events
                    </Link>
                </Button>
            </div>

            <div className="mx-auto w-full max-w-4xl px-4">
                <div className="rounded-lg bg-white p-6">
                    <EventDetail
                        circle={circle}
                        circleHandle={circle.handle!}
                        event={event}
                        canEdit={!!canEdit}
                        canReview={!!canReview}
                        canModerate={!!canModerate}
                        isAuthor={isAuthor}
                    />
                </div>
            </div>
        </div>
    );
}
