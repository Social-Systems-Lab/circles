import { getCircleByHandle } from "@/lib/data/circle";
import { getTaskById } from "@/lib/data/task";
import { TaskForm } from "@/components/modules/tasks/task-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect, notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { getUserPrivate } from "@/lib/data/user";
import { CreatableItemDetail } from "@/components/global-create/global-create-dialog-content";

type PageProps = {
    params: Promise<{ handle: string; shiftId: string }>;
};

export default async function EditShiftPage(props: PageProps) {
    const params = await props.params;
    const circleHandle = params.handle;
    const shiftId = params.shiftId;
    const shiftHref = `/circles/${circleHandle}/shifts/${shiftId}`;

    if (!ObjectId.isValid(shiftId)) {
        notFound();
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    const userProfile = await getUserPrivate(userDid);
    if (!userProfile) {
        notFound();
    }

    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound();
    }

    const shift = await getTaskById(shiftId, userDid);
    if (!shift || (shift.taskType ?? "outcome") !== "shift") {
        notFound();
    }

    const isAuthor = userDid === shift.createdBy;
    const canModerate = await isAuthorized(userDid, circle._id as string, features.tasks.moderate);
    const canEdit = (isAuthor && shift.stage === "review") || (canModerate && shift.stage !== "resolved");

    if (!canEdit) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to edit this shift at its current stage.</p>
                <Button asChild className="mt-4">
                    <Link href={shiftHref}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Shift
                    </Link>
                </Button>
            </div>
        );
    }

    const itemDetailForTaskForm: CreatableItemDetail = {
        key: "task",
        title: "Shift",
        description: "Edit an existing shift.",
        moduleHandle: "tasks",
        createFeatureHandle: "create",
    };

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={shiftHref}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Shift
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Edit Shift</h1>
            </div>
            <TaskForm
                user={userProfile}
                itemDetail={itemDetailForTaskForm}
                circle={circle}
                task={shift}
                taskId={shift._id}
                forcedTaskType="shift"
                hideTaskTypeSelector
                successRedirectPath={shiftHref}
                labels={{
                    editTitle: "Edit Shift",
                    updatedToastTitle: "Shift Updated",
                    updatedToastDescription: "Shift successfully updated.",
                    submitEdit: "Update Shift",
                    titleDescription: "A short, clear name for the shift.",
                    titlePlaceholder: "e.g., Welcome desk morning shift",
                    descriptionLabel: "Shift Details",
                    descriptionPlaceholder: "Add details participants should know",
                    imagesDescription: "Upload images related to the shift (max 5 files, 5MB each).",
                    locationDescription: "Add the place where participants should arrive.",
                }}
            />
        </div>
    );
}
