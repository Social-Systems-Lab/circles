import type { Metadata } from "next";
import { getServerSettings } from "@/lib/data/server-settings";
import { getDefaultCircle } from "@/lib/data/circle";
import BaseLayout from "@/components/layout/base-layout";

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    let serverConfig = await getServerSettings();
    let circle = await getDefaultCircle(serverConfig);

    return (
        <BaseLayout circle={circle} serverConfig={serverConfig} isDefaultCircle={true}>
            {children}
        </BaseLayout>
    );
}

export async function generateMetadata(): Promise<Metadata> {
    // get circle from database
    let circle = await getDefaultCircle();
    let title = circle.name;
    let description = circle.description;
    let icon = circle.picture?.url ?? "/images/default-picture.png";

    return {
        title: title,
        description: description,
        icons: [icon],
    };
}

export const dynamic = "force-dynamic";
