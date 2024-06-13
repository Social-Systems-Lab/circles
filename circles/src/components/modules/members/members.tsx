import { ModulePageProps } from "../dynamic-page";

export default async function MembersModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    console.log("Members Module", circle, page, subpage, isDefaultCircle);

    return <div className="flex h-[200px] flex-1 flex-col bg-blue-100">Members Module</div>;
}
