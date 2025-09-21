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
        <div className="mx-auto max-w-3xl space-y-6 p-4">
            <div className="flex w-full flex-row items-center gap-2">
                <div className="flex flex-1 flex-col">
                    <Input placeholder="Search discussions..." />
                </div>

                <Select defaultValue="all">
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="announcements">Announcements</SelectItem>
                        <SelectItem value="questions">Questions</SelectItem>
                    </SelectContent>
                </Select>

                <Button asChild>
                    <Link href={`/circles/${handle}/discussions/new`}>
                        <Plus className="mr-2 h-4 w-4" /> Create Discussion
                    </Link>
                </Button>
            </div>

            <DiscussionList discussions={discussions || []} />
        </div>
    );
}
