import { getUserByHandle } from "@/lib/data/user";
import HomeModule from "@/components/modules/home/home";
import { redirect } from "next/navigation";

type HomeProps = {
    params: { handle: string };
};

export default async function Home({ params }: HomeProps) {
    let user = await getUserByHandle(params.handle);
    if (!user) {
        // redirect to not-found
        redirect("/not-found");
    }
    return <HomeModule circle={user} isDefaultCircle={false} isUser={true} />;
}
