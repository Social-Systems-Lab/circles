import { DiscussionForm } from "@/components/modules/discussions/discussion-form";
import { getCircleByHandle } from "@/lib/data/circle";

export default async function NewDiscussionPage(props: { params: Promise<{ handle: string }> }) {
    const { handle } = await props.params;

    const circle = await getCircleByHandle(handle);

    return (
        <div className="mx-auto max-w-3xl p-6">
            <DiscussionForm
                moduleHandle={handle}
                createFeatureHandle="discussion"
                itemKey="discussion"
                initialSelectedCircleId={circle?._id}
            />
        </div>
    );
}
