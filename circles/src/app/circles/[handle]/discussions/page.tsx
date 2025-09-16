import DiscussionList from "@/components/modules/discussions/discussion-list";
import DiscussionForm from "@/components/modules/discussions/discussion-form";

interface DiscussionsPageProps {
    params: { handle: string };
}

export default function DiscussionsPage({ params }: DiscussionsPageProps) {
    const { handle } = params;

    return (
        <div className="space-y-6">
            <h1 className="text-xl font-bold">Discussions</h1>
            <DiscussionForm circleHandle={handle} />
            <DiscussionList circleHandle={handle} />
        </div>
    );
}
