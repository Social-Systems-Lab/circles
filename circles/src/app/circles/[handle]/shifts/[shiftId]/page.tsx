import { getCircleByHandle } from "@/lib/data/circle";
import { getTaskAction, ensureShadowPostForTaskAction } from "../../tasks/actions";
import TaskDetail from "@/components/modules/tasks/task-detail";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect, notFound } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string; shiftId: string }>;
};

export default async function ShiftDetailPage(props: PageProps) {
    const params = await props.params;
    const circleHandle = params.handle;
    const shiftId = params.shiftId;
    const backHref = `/circles/${circleHandle}/shifts`;

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound();
    }

    const shift = await getTaskAction(circleHandle, shiftId);
    if (!shift || (shift.taskType ?? "outcome") !== "shift") {
        notFound();
    }

    if (!shift.commentPostId) {
        const ensuredPostId = await ensureShadowPostForTaskAction(shiftId, circle._id as string);
        if (ensuredPostId) {
            shift.commentPostId = ensuredPostId;
        }
    }

    const permissions = {
        canModerate: await isAuthorized(userDid, circle._id as string, features.tasks.moderate),
        canReview: await isAuthorized(userDid, circle._id as string, features.tasks.review),
        canAssign: await isAuthorized(userDid, circle._id as string, features.tasks.assign),
        canResolve: await isAuthorized(userDid, circle._id as string, features.tasks.resolve),
        canComment: await isAuthorized(userDid, circle._id as string, features.tasks.comment),
    };

    return (
        <div className="formatted flex w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={backHref}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Shifts
                    </Link>
                </Button>
            </div>

            <div className="mx-auto w-full max-w-4xl px-4">
                <TaskDetail task={shift} circle={circle} permissions={permissions} currentUserDid={userDid} />
            </div>
        </div>
    );
}
