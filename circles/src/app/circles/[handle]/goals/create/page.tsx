import { getCircleByHandle } from "@/lib/data/circle";
import { GoalForm } from "@/components/modules/goals/goal-form"; // Import GoalForm
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user"; // Import getUserPrivate
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation"; // Import notFound
import { UserPrivate } from "@/models/models"; // Import UserPrivate
import { creatableItemsList, CreatableItemDetail } from "@/components/global-create/global-create-dialog-content"; // Added imports

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function CreateGoalPage(props: PageProps) {
    // Renamed function
    const params = await props.params;
    const circleHandle = params.handle;

    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }
    const user = await getUserPrivate(userDid); // Get full user object
    if (!user) {
        console.error("Failed to fetch user details for DID:", userDid);
        redirect("/login");
    }

    // Get the circle
    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound(); // Use notFound if circle doesn't exist
    }

    // Check if user has permission to create goals
    const canCreateGoals = await isAuthorized(userDid, circle._id as string, features.goals.create); // Updated feature check
    if (!canCreateGoals) {
        // Updated variable
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to create goals in this circle.</p>{" "}
                {/* Updated text & fixed quote */}
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

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/goals`}>
                        {" "}
                        {/* Updated path */}
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Goals {/* Updated text */}
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Create New Goal</h1> {/* Updated text */}
            </div>
            {/* Render GoalForm, passing circle and circleHandle */}
            <GoalForm
                user={user as UserPrivate}
                itemDetail={creatableItemsList.find((item) => item.key === "goal") as CreatableItemDetail}
                initialSelectedCircleId={circle._id}
            />
        </div>
    );
}
