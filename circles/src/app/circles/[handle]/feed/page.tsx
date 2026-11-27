import { buildFeedCircleDto } from "@/lib/data/client-circle-dto";
import { getCirclePageAccess } from "../circle-page-access";
import FeedsModule from "@/components/modules/feeds/feeds";
import { notFound } from "next/navigation";
import { createDefaultFeed } from "@/lib/data/feed";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function FeedPage(props: PageProps) {
    const { handle } = await props.params;
    const access = await getCirclePageAccess(handle);
    if (!access) notFound();

    const { circle, viewerDid } = access;
    if (!circle._id) notFound();
    if (viewerDid) {
        await createDefaultFeed(circle._id);
    }

    return <FeedsModule key={handle} searchParams={props.searchParams} circle={buildFeedCircleDto(circle)} />;
}
