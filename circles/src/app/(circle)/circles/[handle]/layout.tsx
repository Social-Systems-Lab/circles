import type { Metadata } from "next";
import { getServerSettings } from "@/lib/data/server-settings";
import { getCircleByHandle, getDefaultCircle } from "@/lib/data/circle";
import BaseLayout from "@/components/layout/base-layout";
import { redirect } from "next/navigation";

type Props = {
    params: Promise<{ handle: string }>;
    children: React.ReactNode;
};

export default async function RootLayout(props: Props) {
    const params = await props.params;

    const {
        children
    } = props;

    let serverConfig = await getServerSettings();
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

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params;
    let handle = params.handle;

    // get circle from database
    let circle = await getCircleByHandle(handle);
    if (!circle) {
        circle = await getDefaultCircle();
    }

    let title = circle.name;
    let description = circle.description;
    let icon = circle.picture?.url ?? "/images/default-picture.png";

    return {
        title: title,
        description: description,
        icons: [icon],
    };
}
