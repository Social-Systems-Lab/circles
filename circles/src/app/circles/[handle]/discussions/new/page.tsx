import DiscussionForm from "@/components/modules/discussions/discussion-form";

export default async function NewDiscussionPage(props: { params: Promise<{ handle: string }> }) {
    const { handle } = await props.params;

    return (
        <div className="mx-auto max-w-3xl p-6">
            <DiscussionForm circleHandle={handle} />
        </div>
    );
}
