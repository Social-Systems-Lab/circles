"use server";

import { ModulePageProps } from "../dynamic-page";
import { getMembers } from "@/lib/data/member";
import MembersTable from "./members-table";

export default async function MembersModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    console.log("Members Module", circle, page, subpage, isDefaultCircle);

    // get members of circle
    let members = await getMembers(circle?._id);

    return (
        <div className="flex w-full flex-col lg:flex-row lg:pt-[20px]">
            <div className="relative flex flex-col items-center pb-2 lg:flex-1 lg:items-end"></div>
            <div className="flex h-full flex-1 items-start justify-center md:pl-8 lg:grow-[3]">
                <MembersTable circle={circle} members={members} page={page} isDefaultCircle={isDefaultCircle} />
            </div>
            <div className="flex flex-1"></div>
        </div>
    );
}
