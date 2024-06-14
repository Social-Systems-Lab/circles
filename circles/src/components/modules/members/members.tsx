import { ModulePageProps } from "../dynamic-page";

export default async function MembersModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    console.log("Members Module", circle, page, subpage, isDefaultCircle);

    // TODO get paginated list of members

    // get members of circle

    return (
        <div className="flex w-full flex-col lg:flex-row lg:pt-[20px]">
            <div className="relative flex flex-col items-center pb-2 lg:flex-1 lg:items-end"></div>
            <div className="flex h-full flex-1 items-start justify-center md:pl-8 lg:grow-[2]">Members Module</div>
            <div className="flex flex-1"></div>
        </div>
    );
}
