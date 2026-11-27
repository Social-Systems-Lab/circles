import type { Metadata } from "next";
import type { Circle } from "@/models/models";
import { resolveAuthenticatedViewerDid } from "@/lib/auth/authenticated-viewer";

export type CircleRouteAccess = {
    circle: Circle;
    viewerDid: string | undefined;
    canEditAbout: boolean;
};

type CircleRouteAccessDependencies = {
    findCircle: (handle: string) => Promise<Circle | null>;
    authenticate: () => Promise<string | undefined>;
    canReadCircle: (viewerDid: string | undefined, circle: Circle) => Promise<boolean>;
    isCirclePublished: (circle: Circle) => boolean;
    canEditAbout: (viewerDid: string, circleId: string) => Promise<boolean>;
};

export async function resolveCircleRouteAccess(
    handle: string,
    dependencies: CircleRouteAccessDependencies,
): Promise<CircleRouteAccess | null> {
    const circle = await dependencies.findCircle(handle);
    const viewerDid = await resolveAuthenticatedViewerDid(dependencies.authenticate);
    if (!circle || !(await dependencies.canReadCircle(viewerDid, circle))) return null;
    const authorized = Boolean(viewerDid && circle._id && (await dependencies.canEditAbout(viewerDid, circle._id)));
    const canEditAbout = authorized && (circle.circleType !== "user" || viewerDid === circle.did);
    const isCreator = Boolean(viewerDid && circle.createdBy === viewerDid);
    if (!dependencies.isCirclePublished(circle) && !authorized && !isCreator) return null;

    return { circle, viewerDid, canEditAbout };
}

export const buildCircleMetadata = (circle: Circle): Metadata => ({
    title: circle.name,
    description: circle.description ?? circle.mission,
    icons: ["/images/default-picture.png"],
});

export async function resolveCircleRouteMetadata(
    access: CircleRouteAccess | null,
    getGenericCircle: () => Promise<Circle>,
): Promise<Metadata> {
    return buildCircleMetadata(access?.circle ?? (await getGenericCircle()));
}
