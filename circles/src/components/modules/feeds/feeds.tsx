"use server";

import { CreateNewPost } from "@/components/create-new-post";
import { ModulePageProps } from "../dynamic-page";
import { getFeeds } from "@/lib/data/feed";

export default async function FeedsModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    const feeds = await getFeeds(circle?._id);

    return (
        <div className="flex flex-1 flex-row justify-center overflow-hidden">
            <div className="mb-4 ml-4 mr-4 mt-4 flex max-w-[1100px] flex-1 flex-col">
                <h1 className="mb-4 text-2xl font-bold">Feeds</h1>
                <CreateNewPost circle={circle} />
                {feeds?.map((feed) => (
                    <div key={feed._id.toString()} className="flex items-center space-x-2">
                        <span>{feed.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
