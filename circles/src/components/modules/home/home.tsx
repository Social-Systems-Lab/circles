import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { Circle, SortingOptions } from "@/models/models";
import HomeModuleWrapper from "./home-module-wrapper";
import HomeCover from "./home-cover";
import HomeContent from "./home-content";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getCirclesWithMetrics } from "@/lib/data/circle";
import { getMembersWithMetrics } from "@/lib/data/member";

type HomeModuleProps = {
    circle: Circle;
    isDefaultCircle: boolean;
    searchParams?: { [key: string]: string | string[] | undefined };
};

export default async function HomeModule({ circle, isDefaultCircle, searchParams }: HomeModuleProps) {
    let authorizedToEdit = false;
    let userDid = undefined;
    try {
        userDid = await getAuthenticatedUserDid();
        authorizedToEdit = await isAuthorized(userDid, circle._id ?? "", features.settings_edit);
    } catch (error) {}

    // get all circles and members
    let circles = await getCirclesWithMetrics(userDid, circle?._id, searchParams?.sort as SortingOptions);
    let members = await getMembersWithMetrics(userDid, circle?._id, searchParams?.sort as SortingOptions);

    return (
        <ContentDisplayWrapper content={[...circles, ...members]}>
            <HomeModuleWrapper circle={circle} isDefaultCircle={isDefaultCircle}>
                <HomeCover circle={circle} isDefaultCircle={isDefaultCircle} authorizedToEdit={authorizedToEdit} />
                <HomeContent circle={circle} isDefaultCircle={isDefaultCircle} authorizedToEdit={authorizedToEdit} />
            </HomeModuleWrapper>
        </ContentDisplayWrapper>
    );
}
