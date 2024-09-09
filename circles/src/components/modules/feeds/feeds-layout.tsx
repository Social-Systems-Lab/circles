"use server";

import { createDefaultFeeds, getFeeds } from "@/lib/data/feed";
import { ModuleLayoutPageProps } from "../dynamic-page-layout";
import { FeedsLayoutWrapper } from "./feeds-layout-wrapper";
import { redirect } from "next/navigation";
import { Feed } from "@/models/models";

export default async function FeedsModuleLayout({
    children,
    circle,
    page,
    isUser,
    isDefaultCircle,
}: ModuleLayoutPageProps) {
    // get feeds
    let feeds = await getFeeds(circle?._id);
    if (!feeds || feeds.length === 0) {
        console.log("Creating default feeds");

        // create default feeds
        feeds = (await createDefaultFeeds(circle?._id, isUser!)) as Feed[];
        if (!feeds) {
            // redirect to error
            redirect("/error");
        }
    }

    return (
        <FeedsLayoutWrapper circle={circle} feeds={feeds} isDefaultCircle={isDefaultCircle}>
            {children}
        </FeedsLayoutWrapper>
    );
}
