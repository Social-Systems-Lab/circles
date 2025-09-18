"use client";

import DiscussionForm from "@/components/modules/discussions/discussion-form";

export default function NewDiscussionPage({ params }: { params: { handle: string } }) {
    return (
        <div className="mx-auto max-w-3xl p-6">
            <DiscussionForm circleHandle={params.handle} />
        </div>
    );
}
