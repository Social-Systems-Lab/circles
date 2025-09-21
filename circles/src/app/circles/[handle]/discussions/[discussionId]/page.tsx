import DiscussionDetail from "@/components/modules/discussions/discussion-detail";
import { DiscussionItem } from "@/components/modules/discussions/discussion-list";

interface DiscussionDetailPageProps {
    params: Promise<{ handle: string; discussionId: string }>;
}

export default async function DiscussionDetailPage(props: DiscussionDetailPageProps) {
    const { handle, discussionId } = await props.params;

    return (
        <div className="mx-auto max-w-3xl p-6">
            <DiscussionItem />
            // <DiscussionDetail discussionId={discussionId} />
        </div>
    );
}
