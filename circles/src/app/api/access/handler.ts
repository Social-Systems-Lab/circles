import type { Circle, Member } from "@/models/models";
import { NextResponse } from "next/server";
import { resolveAuthenticatedViewerDid } from "@/lib/auth/authenticated-viewer";

type AccessHandlerDependencies = {
    authenticate: () => Promise<string | undefined>;
    findCircle: (handle: string) => Promise<Circle | null>;
    canReadCircle: (viewerDid: string | undefined, circle: Circle) => Promise<boolean>;
    getMember: (userDid: string, circleId: string) => Promise<Member | null>;
    isCirclePublished: (circle: Circle) => boolean;
    isModuleEnabled: (circle: Circle, moduleHandle: string) => boolean;
};

const neutralCircleNotFound = () =>
    NextResponse.json({ notFound: true, notFoundType: "circle" }, { status: 404 });

export const createAccessPostHandler = (dependencies: AccessHandlerDependencies) =>
    async function accessPostHandler(req: Request): Promise<Response> {
        try {
            const { circleHandle, moduleHandle } = await req.json();
            const permissionModuleHandle = moduleHandle === "shifts" ? "tasks" : moduleHandle;

            if (!circleHandle) {
                return NextResponse.json({ authenticated: true, authorized: true });
            }

            const circle = await dependencies.findCircle(circleHandle);
            const userDid = await resolveAuthenticatedViewerDid(dependencies.authenticate);
            if (!circle || !(await dependencies.canReadCircle(userDid, circle))) {
                return neutralCircleNotFound();
            }

            if (!dependencies.isCirclePublished(circle)) {
                const membership = userDid ? await dependencies.getMember(userDid, circle._id) : null;
                const canViewUnpublished = circle.createdBy === userDid || membership?.userGroups?.includes("admins");
                if (!canViewUnpublished) return neutralCircleNotFound();
            }

            const isFundingRoute = moduleHandle === "funding";
            if (isFundingRoute && circle.circleType !== "circle") {
                return NextResponse.json({ notFound: true, notFoundType: "module" }, { status: 404 });
            }

            if (!dependencies.isModuleEnabled(circle, moduleHandle)) {
                return NextResponse.json({ notFound: true, notFoundType: "module" }, { status: 404 });
            }

            const accessRules = circle.accessRules || {};
            let allowedUserGroups = accessRules[permissionModuleHandle]?.view;
            if (!allowedUserGroups) {
                allowedUserGroups = isFundingRoute ? ["admins", "moderators", "members"] : ["everyone"];
            }

            if (allowedUserGroups.includes("everyone")) {
                return NextResponse.json({ authenticated: true, authorized: true });
            }
            if (!userDid) return NextResponse.json({ authenticated: false, authorized: false });

            const membership = await dependencies.getMember(userDid, circle._id);
            if (!membership) return NextResponse.json({ authenticated: true, authorized: false });

            const authorized = allowedUserGroups.some((group) => membership.userGroups?.includes(group));
            return NextResponse.json({ authenticated: true, authorized });
        } catch (error) {
            console.error("Error in /api/access:", error);
            return NextResponse.json({ error: true }, { status: 500 });
        }
    };
