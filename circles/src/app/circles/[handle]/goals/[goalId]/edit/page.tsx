import { getCircleByHandle } from "@/lib/data/circle";
import { getGoalById } from "@/lib/data/goal"; // Use goal data function
import { GoalForm } from "@/components/modules/goals/goal-form"; // Use GoalForm
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";

type PageProps = {
    params: Promise<{ handle: string; goalId: string }>; // Expect goalId
};

export default async function EditGoalPage(props: PageProps) {
    // Renamed function
    const params = await props.params;
    const circleHandle = params.handle;
    const goalId = params.goalId; // Use goalId

    // Validate goalId format if necessary (e.g., check if it's a valid ObjectId)
    if (!ObjectId.isValid(goalId)) {
        // Use goalId
        notFound();
    }

    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    // Get the circle
    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound();
    }

    // Get the goal
    const goal = await getGoalById(goalId); // Renamed function call, variable, param
    if (!goal) {
        // Renamed variable
        notFound();
    }

    // Check if user has permission to edit goals
    const canEditGoals = await isAuthorized(userDid, circle._id as string, features.goals.update); // Updated feature check
    if (!canEditGoals) {
        // Renamed variable
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to edit goals in this circle.</p>{" "}
                {/* Updated text & fixed quote */}
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/goals/${goalId}`}>
                        {" "}
                        {/* Updated path */}
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Goal {/* Updated text */}
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/goals/${goalId}`}>
                        {" "}
                        {/* Updated path */}
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Goal {/* Updated text */}
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Edit Goal</h1> {/* Updated text */}
            </div>
            {/* Render GoalForm, passing circle, circleHandle, and the existing goal */}
            <GoalForm circle={circle} circleHandle={circleHandle} goal={goal} goalId={goal._id} />{" "}
            {/* Use GoalForm, pass goal/goalId */}
        </div>
    );
}
