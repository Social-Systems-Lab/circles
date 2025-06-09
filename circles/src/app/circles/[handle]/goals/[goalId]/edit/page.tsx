import { getCircleByHandle } from "@/lib/data/circle";
import { getGoalById } from "@/lib/data/goal";
import { GoalForm } from "@/components/modules/goals/goal-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { UserPrivate } from "@/models/models"; // Added import
import { getUserPrivate } from "@/lib/data/user"; // Corrected function name
import { CreatableItemDetail } from "@/components/global-create/global-create-dialog-content"; // Added import

type PageProps = {
    params: Promise<{ handle: string; goalId: string }>;
};

export default async function EditGoalPage(props: PageProps) {
    const params = await props.params;
    const circleHandle = params.handle;
    const goalId = params.goalId;

    if (!ObjectId.isValid(goalId)) {
        notFound();
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    // Fetch user profile
    const userProfile = await getUserPrivate(userDid); // Corrected function call
    if (!userProfile) {
        // Handle case where user profile is not found, e.g., redirect or show error
        console.error("User profile not found for DID:", userDid);
        notFound(); // Or redirect to an error page
    }

    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound();
    }

    const goal = await getGoalById(goalId);
    if (!goal) {
        notFound();
    }

    const canEditGoals = await isAuthorized(userDid, circle._id.toString(), features.goals.update);
    if (!canEditGoals) {
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

    // Define itemDetail for GoalForm
    const itemDetailForGoalForm: CreatableItemDetail = {
        key: "goal",
        title: "Goal", // GoalForm will display "Edit Goal" based on `isEditing`
        description: "Edit an existing goal.", // Placeholder description
        moduleHandle: "goals", // From creatableItemsList definition
        createFeatureHandle: "create", // From creatableItemsList definition
        // icon: Target, // Optional: could import Target from lucide-react if needed by GoalForm
    };

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/goals/${goalId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Goal
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Edit Goal</h1>
            </div>
            <GoalForm
                user={userProfile}
                itemDetail={itemDetailForGoalForm}
                goal={goal}
                goalId={goalId} // Use the string goalId from params
                initialSelectedCircleId={circle._id.toString()} // Pass circle's ID as string
                circle={circle} // Pass the fetched circle object
                // onFormSubmitSuccess={(data) => {
                //  if (data.id && data.circleHandle) {
                //    router.push(`/circles/${data.circleHandle}/goals/${data.id}`);
                //  }
                // }}
                // onCancel={() => router.back()} // Example cancel handler
            />
        </div>
    );
}
