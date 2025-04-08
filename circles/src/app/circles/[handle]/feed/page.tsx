import { getCircleByHandle } from "@/lib/data/circle";
import FeedsModule from "@/components/modules/feeds/feeds";
import { notFound } from "next/navigation";
import { createDefaultFeeds } from "@/lib/data/feed";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function FeedPage(props: PageProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        notFound();
    }

    // ensure it has a default feed
    let userDid = await getAuthenticatedUserDid();
    if (userDid) {
        await createDefaultFeeds(circle._id, userDid);
    }

    // Pass circle and original props down to FeedsModule
    // FeedsModule likely fetches its own feed/posts using these props
    return <FeedsModule {...props} circle={circle} />;
}
