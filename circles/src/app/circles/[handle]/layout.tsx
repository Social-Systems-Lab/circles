import type { Metadata } from "next";
import { getCircleByHandle, getDefaultCircle, getDiscoverableCirclesByIds, isCirclePublished } from "@/lib/data/circle";
import { redirect } from "next/navigation";
import HomeCover from "@/components/modules/home/home-cover";
import HomeContent from "@/components/modules/home/home-content";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { CircleTabs } from "@/components/layout/circle-tabs";
import { getHumanityVerificationSummary } from "@/lib/data/proof-of-humanity";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { resolveCircleRouteAccess, resolveCircleRouteMetadata } from "./circle-route-access";

type Props = { params: Promise<{ handle: string }>; children: React.ReactNode };

export default async function RootLayout(props: Props) {
    const params = await props.params;

    const { children } = props;

    if (process.env.IS_BUILD === "true") {
        return null;
    }

    const access = await resolveCircleRouteAccess(params.handle, {
        findCircle: getCircleByHandle,
        authenticate: getAuthenticatedUserDid,
        canReadCircle,
    });
    if (!access) redirect("/not-found");

    const { circle, viewerDid: userDid } = access;
    const authorizedToEdit = await isAuthorized(userDid, circle._id ?? "", features.settings.edit_about);
    const canViewCircle = isCirclePublished(circle) || authorizedToEdit || circle.createdBy === userDid;
    if (!canViewCircle) {
        redirect("/not-found");
    }
    const parentCircle = circle.parentCircleId
        ? (await getDiscoverableCirclesByIds([circle.parentCircleId], userDid))[0]
        : undefined;
    const proofOfHumanitySummary =
        circle.circleType === "user" && circle.did ? await getHumanityVerificationSummary(circle.did, userDid) : null;
    const circleForRendering =
        circle.parentCircleId && !parentCircle
            ? { ...circle, parentCircleId: undefined, circleLevel: "top_level" as const }
            : circle;
    const plainCircle = JSON.parse(JSON.stringify(circleForRendering));
    const plainParentCircle = parentCircle ? JSON.parse(JSON.stringify(parentCircle)) : undefined;
    const plainProofOfHumanitySummary = proofOfHumanitySummary
        ? JSON.parse(JSON.stringify(proofOfHumanitySummary))
        : null;

    return (
        <>
            <>
                <HomeCover circle={plainCircle} />
                <HomeContent
                    circle={plainCircle}
                    authorizedToEdit={authorizedToEdit}
                    viewerDid={userDid}
                    parentCircle={plainParentCircle}
                    proofOfHumanitySummary={plainProofOfHumanitySummary}
                />
            </>
            <CircleTabs circle={plainCircle} />

            {children}
        </>
    );
}

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params;
    return resolveCircleRouteMetadata(params.handle, {
        findCircle: getCircleByHandle,
        authenticate: getAuthenticatedUserDid,
        canReadCircle,
        getGenericCircle: getDefaultCircle,
    });
}
