"use server";

import { ModulePageProps } from "../dynamic-page";
import { getMembers } from "@/lib/data/member";
import MembersTable from "./members-table";
import { useIsCompact } from "@/components/utils/use-is-compact";

export default async function MembersModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    console.log("Members Module", circle, page, subpage, isDefaultCircle);

    // get members of circle
    let members = await getMembers(circle?._id);

    return <MembersTable circle={circle} members={members} page={page} isDefaultCircle={isDefaultCircle} />;
}
