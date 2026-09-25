import type { Metadata } from "next";
import { getCircleByHandle, getDefaultCircle, getCircleById, isCirclePublished } from "@/lib/data/circle";
import { redirect } from "next/navigation";
import HomeCover from "@/components/modules/home/home-cover";
import HomeContent from "@/components/modules/home/home-content";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { CircleTabs } from "@/components/layout/circle-tabs";
import { getHumanityVerificationSummary } from "@/lib/data/proof-of-humanity";
import { canReadCircleByLifecycle } from "@/lib/data/circle-lifecycle-policy";
import { getMember } from "@/lib/data/member";
import { buildLayoutClientProps } from "@/lib/data/client-circle-dto";

type Props = { params: Promise<{ handle: string }>; children: React.ReactNode };

export default async function RootLayout(props: Props) {
    const params = await props.params;

    const { children } = props;

    if (process.env.IS_BUILD === "true") {
        return null;
    }

    let circle = await getCircleByHandle(params.handle);
    if (!circle || !canReadCircleByLifecycle(circle)) {
        // redirect to not-found
        redirect("/not-found");
    }

    let authorizedToEdit = false;
    let userDid = await getAuthenticatedUserDid();
    authorizedToEdit = await isAuthorized(userDid, circle._id ?? "", features.settings.edit_about);
    const canViewCircle = isCirclePublished(circle) || authorizedToEdit || circle.createdBy === userDid;
    if (!canViewCircle) {
        redirect("/not-found");
    }
    const parentCircle = circle.parentCircleId ? await getCircleById(circle.parentCircleId) : undefined;
    const proofOfHumanitySummary =
        circle.circleType === "user" && circle.did ? await getHumanityVerificationSummary(circle.did, userDid) : null;
    const viewerMembership = userDid && circle._id ? await getMember(userDid, circle._id.toString()) : null;
    const clientProps = buildLayoutClientProps(circle, parentCircle, userDid, viewerMembership?.userGroups ?? []);
    const plainProofOfHumanitySummary = proofOfHumanitySummary
        ? JSON.parse(JSON.stringify(proofOfHumanitySummary))
        : null;

    return (
        <>
            <>
                <HomeCover {...clientProps.homeCover} />
                <HomeContent
                    {...clientProps.homeContent}
                    authorizedToEdit={authorizedToEdit}
                    viewerDid={userDid}
                    proofOfHumanitySummary={plainProofOfHumanitySummary}
                />
            </>
            <CircleTabs {...clientProps.circleTabs} />

            {children}
        </>
    );
}

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params;
    let handle = params.handle;

    // get circle from database
    let circle = await getCircleByHandle(handle);
    if (!circle || !canReadCircleByLifecycle(circle)) {
        circle = await getDefaultCircle();
    }

    let title = circle.name;
    let description = circle.description ?? circle.mission;
    let icon = "/images/default-picture.png";
    //let icon = circle.picture?.url ?? "/images/default-picture.png"; // Use a default icon if none is set

    return { title: title, description: description, icons: [icon] };
}
