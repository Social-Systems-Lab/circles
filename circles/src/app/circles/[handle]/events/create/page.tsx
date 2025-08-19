// circles/[handle]/events/create/page.tsx
import { getCircleByHandle } from "@/lib/data/circle";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect, notFound } from "next/navigation";
import EventForm from "@/components/modules/events/event-form";

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function CreateEventPage(props: PageProps) {
    const params = await props.params;
    const circleHandle = params.handle;

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound();
    }

    const canCreateEvents = await isAuthorized(userDid, circle._id as string, features.events.create);
    if (!canCreateEvents) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don't have permission to create events in this circle.</p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/events`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Events
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/events`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Events
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Create Draft</h1>
            </div>

            <div className="p-4">
                <EventForm circleHandle={circleHandle} />
            </div>
        </div>
    );
}
