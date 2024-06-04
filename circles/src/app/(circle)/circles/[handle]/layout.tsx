import type { Metadata } from "next";
import { getServerConfig } from "@/lib/data/server-config";
import { getCircleByHandle, getDefaultCircle } from "@/lib/data/circle";
import BaseLayout from "@/components/layout/base-layout";
import { redirect } from "next/navigation";

type Props = {
    params: { handle: string };
    children: React.ReactNode;
};

export default async function RootLayout({ params, children }: Props) {
    let serverConfig = await getServerConfig(true);
    let circle = await getCircleByHandle(params.handle);

    if (!circle) {
        // redirect to not-found
        redirect("/not-found");
    }

    return (
        <BaseLayout circle={circle} serverConfig={serverConfig} isDefaultCircle={false}>
            {children}
        </BaseLayout>
    );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    let handle = params.handle;

    // get circle from database
    let circle = await getCircleByHandle(handle);
    if (!circle) {
        circle = await getDefaultCircle(false);
    }

    let title = circle.name;
    let description = circle.description;
    let icon = circle.picture ?? "/images/default-picture.png";

    return {
        title: title,
        description: description,
        icons: [icon],
    };
}
