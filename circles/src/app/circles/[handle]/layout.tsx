import type { Metadata } from "next";
import { getServerSettings } from "@/lib/data/server-settings";
import { getCircleByHandle, getCirclesWithMetrics, getDefaultCircle } from "@/lib/data/circle";
import BaseLayout from "@/components/layout/base-layout";
import { redirect } from "next/navigation";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import HomeCover from "@/components/modules/home/home-cover";
import HomeContent from "@/components/modules/home/home-content";
import HomeModuleWrapper from "@/components/modules/home/home-module-wrapper";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getMembersWithMetrics } from "@/lib/data/member";
import { features } from "@/lib/data/constants";
import { CircleTabs } from "@/components/layout/circle-tabs";

type Props = {
    params: Promise<{ handle: string }>;
    children: React.ReactNode;
};

export default async function RootLayout(props: Props) {
    const params = await props.params;

    const { children } = props;

    if (process.env.IS_BUILD === "true") {
        return null;
    }

    let circle = await getCircleByHandle(params.handle);
    if (!circle) {
        // redirect to not-found
        redirect("/not-found");
    }

    let authorizedToEdit = false;
    let userDid = await getAuthenticatedUserDid();
    authorizedToEdit = await isAuthorized(userDid, circle._id ?? "", features.settings_edit);

    return (
        <>
            <>
                <HomeCover circle={circle} isDefaultCircle={false} authorizedToEdit={authorizedToEdit} />
                {/* <CircleHeading circle={circle} isDefaultCircle={false} /> */}
                <HomeContent circle={circle} isDefaultCircle={false} authorizedToEdit={authorizedToEdit} />
            </>
            <CircleTabs circle={circle} isDefaultCircle={false} />

            {children}
        </>
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
