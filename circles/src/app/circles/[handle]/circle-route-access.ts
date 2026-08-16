import type { Metadata } from "next";
import type { Circle } from "@/models/models";
import { resolveAuthenticatedViewerDid } from "@/lib/auth/authenticated-viewer";

export type CircleRouteAccess = { circle: Circle; viewerDid: string | undefined };

type CircleRouteAccessDependencies = {
    findCircle: (handle: string) => Promise<Circle | null>;
    authenticate: () => Promise<string | undefined>;
    canReadCircle: (viewerDid: string | undefined, circle: Circle) => Promise<boolean>;
};

export async function resolveCircleRouteAccess(
    handle: string,
    dependencies: CircleRouteAccessDependencies,
): Promise<CircleRouteAccess | null> {
    const circle = await dependencies.findCircle(handle);
    const viewerDid = await resolveAuthenticatedViewerDid(dependencies.authenticate);
    if (!circle || !(await dependencies.canReadCircle(viewerDid, circle))) return null;
    return { circle, viewerDid };
}

export const buildCircleMetadata = (circle: Circle): Metadata => ({
    title: circle.name,
    description: circle.description ?? circle.mission,
    icons: ["/images/default-picture.png"],
});

export async function resolveCircleRouteMetadata(
    handle: string,
    dependencies: CircleRouteAccessDependencies & { getGenericCircle: () => Promise<Circle> },
): Promise<Metadata> {
    const access = await resolveCircleRouteAccess(handle, dependencies);
    return buildCircleMetadata(access?.circle ?? (await dependencies.getGenericCircle()));
}
