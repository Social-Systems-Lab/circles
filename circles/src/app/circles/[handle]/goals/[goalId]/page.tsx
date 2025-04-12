import { getCircleByHandle } from "@/lib/data/circle";
import { getGoalAction } from "../actions"; // Use goal action
import GoalDetail from "@/components/modules/goals/goal-detail"; // Use GoalDetail component
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect, notFound } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string; goalId: string }>; // Expect goalId
};

export default async function GoalDetailPage(props: PageProps) {
    // Renamed function
    const params = await props.params;
    const circleHandle = params.handle;
    const goalId = params.goalId; // Use goalId

    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    // Get the circle
    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound(); // Use notFound if circle doesn't exist
    }

    // Get the goal - getGoalAction already handles basic view permissions
    const goal = await getGoalAction(circleHandle, goalId); // Renamed function call, variable, param

    // If goal is null, it means not found or user not authorized to view
    if (!goal) {
        // Renamed variable
        return (
            <div className="formatted flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Goal Not Found</h2> {/* Updated text */}
                <p className="text-gray-600">
                    The goal you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to view it.{" "}
                    {/* Updated text & fixed quotes */}
                </p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/goals`}>
                        {" "}
                        {/* Updated path */}
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Goals {/* Updated text */}
                    </Link>
                </Button>
            </div>
        );
    }

    // Fetch detailed permissions for actions within the detail view
    const permissions = {
        canModerate: await isAuthorized(userDid, circle._id as string, features.goals.moderate), // Updated feature
        canReview: await isAuthorized(userDid, circle._id as string, features.goals.review), // Updated feature
        canResolve: await isAuthorized(userDid, circle._id as string, features.goals.resolve), // Updated feature
        canComment: await isAuthorized(userDid, circle._id as string, features.goals.comment), // Updated feature
    };

    return (
        <div className="formatted flex w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/goals`}>
                        {" "}
                        {/* Updated path */}
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Goals {/* Updated text */}
                    </Link>
                </Button>
            </div>

            <div className="mx-auto w-full max-w-4xl px-4">
                {/* Render GoalDetail component */}
                <GoalDetail goal={goal} circle={circle} permissions={permissions} currentUserDid={userDid} />{" "}
                {/* Use GoalDetail, pass goal */}
            </div>
        </div>
    );
}
