import { getCircleByHandle } from "@/lib/data/circle";
import MembersModule from "@/components/modules/members/members";
import { notFound } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function FollowersPage(props: PageProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);

    if (!circle || !circle._id) {
        notFound();
    }
    return <MembersModule circle={circle} />;
}
