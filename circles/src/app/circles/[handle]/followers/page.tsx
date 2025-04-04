import { getCircleByHandle } from "@/lib/data/circle";
import { getMembersWithMetrics } from "@/lib/data/member";
import MembersModule from "@/components/modules/members/members"; // Changed to default import
import { notFound } from "next/navigation";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { SortingOptions } from "@/models/models";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function FollowersPage(props: PageProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);

    if (!circle || !circle._id) {
        notFound();
    }
    return <MembersModule circle={circle} />;
}
