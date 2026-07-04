// circles/[handle]/events/[eventId]/page.tsx
import { getCircleByHandle } from "@/lib/data/circle";
import { notFound } from "next/navigation";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getEventAction } from "@/app/circles/[handle]/events/actions";
import { canManageEvent, normalizeEventHostCircleIds } from "@/lib/data/event";
import EventDetail from "@/components/modules/events/event-detail";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type PageProps = {
    params: Promise<{ handle: string; eventId: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function EventDetailPage(props: PageProps) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const sourceParam = Array.isArray(searchParams?.source) ? searchParams.source[0] : searchParams?.source;
    const isNoticeboardSource = sourceParam === "noticeboard";
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
    const hostCircleIds = normalizeEventHostCircleIds(event);
    const hostPermissionChecks = userDid
        ? await Promise.all(
              hostCircleIds.map(async (hostCircleId) => ({
                  canReview: await isAuthorized(userDid, hostCircleId, features.events.review),
                  canModerate: await isAuthorized(userDid, hostCircleId, features.events.moderate),
              })),
          )
        : [];
    const canModerate = hostPermissionChecks.some((check) => check.canModerate);
    const canReview = hostPermissionChecks.some((check) => check.canReview);
    const isAuthor = !!userDid && userDid === event.createdBy;
    const canEdit = userDid ? await canManageEvent(userDid, event) : false;

    return (
        <div className="formatted flex w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circle.handle}/${isNoticeboardSource ? "feed" : "events"}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        {isNoticeboardSource ? "Back to Noticeboard" : "Back to Events"}
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
