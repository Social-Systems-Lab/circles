"use server";

import { ModulePageProps } from "../dynamic-page";
import { getMembers } from "@/lib/data/member";
import MembersTable from "./members-table";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { User } from "@/models/models";

export default async function MembersModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    // get members of circle
    let members = await getMembers(circle?._id);
    if (circle?.circleType === "user") {
        members = members.filter((m) => m.userDid !== (circle as User).did);
    }

    return <MembersTable circle={circle} members={members} page={page} isDefaultCircle={isDefaultCircle} />;
}
