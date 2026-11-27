import type { Metadata } from "next";
import { getDefaultCircle, getDiscoverableCirclesByIds, isCirclePublished } from "@/lib/data/circle";
import { redirect } from "next/navigation";
import HomeCover from "@/components/modules/home/home-cover";
import HomeContent from "@/components/modules/home/home-content";
import { isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { CircleTabs } from "@/components/layout/circle-tabs";
import { getHumanityVerificationSummary } from "@/lib/data/proof-of-humanity";
import { resolveCircleRouteMetadata } from "./circle-route-access";
import { getCirclePageAccess } from "./circle-page-access";
import { getMember } from "@/lib/data/member";
import { buildLayoutClientProps, buildVisibleCircleModuleHandles } from "@/lib/data/client-circle-dto";

type Props = { params: Promise<{ handle: string }>; children: React.ReactNode };

export default async function RootLayout(props: Props) {
    const params = await props.params;

    const { children } = props;

    if (process.env.IS_BUILD === "true") {
        return null;
    }

    const access = await getCirclePageAccess(params.handle);
    if (!access) redirect("/not-found");

    const { circle, viewerDid: userDid, canEditAbout } = access;
    const canInviteSecret = Boolean(
        userDid && circle._id && circle.visibility === "secret" &&
            (await isAuthorized(userDid, circle._id, features.general.invite_members)),
    );
    const parentCircle = circle.parentCircleId
        ? (await getDiscoverableCirclesByIds([circle.parentCircleId], userDid))[0]
        : undefined;
    const proofOfHumanitySummary =
        circle.circleType === "user" && circle.did ? await getHumanityVerificationSummary(circle.did, userDid) : null;
    const circleForRendering =
        circle.parentCircleId && !parentCircle
            ? { ...circle, parentCircleId: undefined, circleLevel: "top_level" as const }
            : circle;
    const viewerMembership = userDid && circle._id ? await getMember(userDid, circle._id.toString()) : null;
    const clientProps = buildLayoutClientProps(
        circleForRendering,
        parentCircle,
        userDid,
        viewerMembership?.userGroups ?? [],
        proofOfHumanitySummary,
    );

    return (
        <>
            <>
                <HomeCover {...clientProps.homeCover} />
                <HomeContent
                    {...clientProps.homeContent}
                    authorizedToEdit={canEditAbout}
                    viewerDid={userDid}
                    canInviteSecret={canInviteSecret}
                    canSharePublic={isCirclePublished(circle) && buildVisibleCircleModuleHandles(circle, []).includes("home")}
                />
            </>
            <CircleTabs {...clientProps.circleTabs} />

            {children}
        </>
    );
}

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params;
    return resolveCircleRouteMetadata(await getCirclePageAccess(params.handle), getDefaultCircle);
}
