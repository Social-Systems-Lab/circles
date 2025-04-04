"use server";

import { createDefaultFeeds, getFeeds } from "@/lib/data/feed";
import { FeedsLayoutWrapper } from "./feeds-layout-wrapper";
import { redirect } from "next/navigation";
import { Circle, Feed } from "@/models/models";

type PageProps = {
    circle: Circle;
    children: React.ReactNode;
};

export default async function FeedsModuleLayout({ children, circle }: PageProps) {
    // get feeds
    let feeds = await getFeeds(circle?._id);
    if (!feeds || feeds.length === 0) {
        console.log("Creating default feeds");

        // create default feeds
        feeds = (await createDefaultFeeds(circle?._id)) as Feed[];
        if (!feeds) {
            // redirect to error
            redirect("/error");
        }
    }

    return (
        <FeedsLayoutWrapper circle={circle} feeds={feeds}>
            {children}
        </FeedsLayoutWrapper>
    );
}
