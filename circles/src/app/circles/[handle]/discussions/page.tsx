import DiscussionList from "@/components/modules/discussions/discussion-list";
import DiscussionForm from "@/components/modules/discussions/discussion-form";

interface DiscussionsPageProps {
    params: Promise<{ handle: string }>;
}

export default async function DiscussionsPage(props: DiscussionsPageProps) {
    const { handle } = await props.params;

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-4">
            <DiscussionForm circleHandle={handle} />
            <DiscussionList circleHandle={handle} />
        </div>
    );
}
