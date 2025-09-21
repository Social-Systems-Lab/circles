import DiscussionList from "@/components/modules/discussions/discussion-list";
import Link from "next/link";
import { listDiscussionsAction } from "./actions";

interface DiscussionsPageProps {
    params: Promise<{ handle: string }>;
}

export default async function DiscussionsPage(props: DiscussionsPageProps) {
    const { handle } = await props.params;
    const discussions = await listDiscussionsAction(handle);

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-4">
            <div className="flex justify-end">
                <Link
                    href={`/circles/${handle}/discussions/new`}
                    className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                    Create Discussion
                </Link>
            </div>
            <DiscussionList discussions={discussions || []} />
        </div>
    );
}
