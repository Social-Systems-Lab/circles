import DiscussionList from "@/components/modules/discussions/discussion-list";
import { listDiscussionsAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import Link from "next/link";

interface DiscussionsPageProps {
    params: Promise<{ handle: string }>;
}

export default async function DiscussionsPage(props: DiscussionsPageProps) {
    const { handle } = await props.params;
    const discussions = await listDiscussionsAction(handle);

    return (
        <div className="flex flex-1 flex-row justify-center">
            <div className="mb-4 ml-2 mr-2 mt-4 flex max-w-[1100px] flex-1 flex-col space-y-6">
                <DiscussionList discussions={discussions || []} circleHandle={handle} />
            </div>
        </div>
    );
}
