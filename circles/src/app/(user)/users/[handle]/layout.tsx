import type { Metadata } from "next";
import { getServerSettings } from "@/lib/data/server-settings";
import BaseLayout from "@/components/layout/base-layout";
import { redirect } from "next/navigation";
import { getUserByHandle } from "@/lib/data/user";

type Props = {
    params: { handle: string };
    children: React.ReactNode;
};

export default async function RootLayout({ params, children }: Props) {
    let serverConfig = await getServerSettings();
    let user = await getUserByHandle(params.handle);

    if (!user) {
        // redirect to not-found
        redirect("/not-found");
    }

    return (
        <BaseLayout circle={user} serverConfig={serverConfig} isDefaultCircle={false} isUser={true}>
            {children}
        </BaseLayout>
    );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    let handle = params.handle;

    // get user from database
    let user = await getUserByHandle(handle);
    if (!user) {
        return {
            title: "User not found",
            description: "User not found",
            icons: ["/images/default-user-picture.png"],
        };
    }

    let title = user.name;
    let description = user.description;
    let icon = user.picture?.url ?? "/images/default-user-picture.png";

    return {
        title: title,
        description: description,
        icons: [icon],
    };
}
