"use server";

import { ModulePageProps } from "../dynamic-page";
import { getCircles } from "@/lib/data/circle";
import CirclesTable from "./circles-table";
import { useIsCompact } from "@/components/utils/use-is-compact";

export default async function CirclesModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    // get all circles
    let circles = await getCircles(circle?._id);

    return <CirclesTable circle={circle} circles={circles} page={page} isDefaultCircle={isDefaultCircle} />;
}
