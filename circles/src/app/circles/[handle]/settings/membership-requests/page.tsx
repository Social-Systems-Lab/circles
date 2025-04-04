import { getCircleByHandle } from "@/lib/data/circle";
import MembershipRequestsModule from "@/components/modules/membership-requests/membership-requests";
import { getAllMembershipRequestsAction } from "@/components/modules/membership-requests/actions"; // Import the action
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // For error display
import { Terminal } from "lucide-react";

type PageProps = {
    params: { handle: string };
};

export default async function MembershipRequestsPage({ params }: PageProps) {
    const circle = await getCircleByHandle(params.handle);

    if (!circle || !circle._id) {
        notFound();
    }

    // Fetch membership requests using the action
    const {
        success,
        message,
        pendingRequests = [], // Default to empty array
        rejectedRequests = [], // Default to empty array
    } = await getAllMembershipRequestsAction(circle._id);

    if (!success) {
        // Display an error message if fetching failed
        return (
            <Alert variant="destructive" className="m-4">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Error Fetching Requests</AlertTitle>
                <AlertDescription>{message || "An unexpected error occurred."}</AlertDescription>
            </Alert>
        );
    }

    // Render the module, passing the fetched data (omitting 'page' prop for now)
    return (
        <MembershipRequestsModule
            circle={circle}
            pendingRequests={pendingRequests}
            rejectedRequests={rejectedRequests}
        />
    );
}
