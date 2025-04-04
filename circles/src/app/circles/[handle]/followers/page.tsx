import { getCircleByHandle } from "@/lib/data/circle";
import { getMembersWithMetrics } from "@/lib/data/member";
import MembersModule from "@/components/modules/members/members"; // Changed to default import
import { notFound } from "next/navigation";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { SortingOptions } from "@/models/models";

type PageProps = {
    params: { handle: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function FollowersPage({ params, searchParams }: PageProps) {
    const circle = await getCircleByHandle(params.handle);
    const userDid = await getAuthenticatedUserDid(); // Needed for metrics calculation

    if (!circle || !circle._id) {
        notFound();
    }

    // Determine sorting option from searchParams, default to 'pop' or similar if needed
    const sortOption = (searchParams?.sort as SortingOptions) || "pop";

    // Fetch members data
    const members = await getMembersWithMetrics(userDid, circle._id, sortOption);

    // Render the specific module component
    // Assuming MembersModule takes 'circle' and 'members' props
    return <MembersModule circle={circle} members={members} />;
}
