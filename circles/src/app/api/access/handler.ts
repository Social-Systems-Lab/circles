import type { Circle, Member } from "@/models/models";
import { NextResponse } from "next/server";
import { resolveAuthenticatedViewerDid } from "@/lib/auth/authenticated-viewer";
import { readJsonBodyLimited } from "@/lib/security/bounded-input";

type AccessHandlerDependencies = {
    authenticate: () => Promise<string | undefined>;
    findCircle: (handle: string) => Promise<Circle | null>;
    canReadCircle: (viewerDid: string | undefined, circle: Circle) => Promise<boolean>;
    getMember: (userDid: string, circleId: string) => Promise<Member | null>;
    isCirclePublished: (circle: Circle) => boolean;
    isModuleEnabled: (circle: Circle, moduleHandle: string) => boolean;
};

const neutralCircleNotFound = () => NextResponse.json({ notFound: true, notFoundType: "circle" }, { status: 404 });

export const createAccessPostHandler = (dependencies: AccessHandlerDependencies) =>
    async function accessPostHandler(req: Request): Promise<Response> {
        try {
            const body = await readJsonBodyLimited(req, 8 * 1024);
            if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
            if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
                return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
            }
            const { circleHandle, moduleHandle } = body.value as { circleHandle?: unknown; moduleHandle?: unknown };
            if (
                (circleHandle !== undefined && (typeof circleHandle !== "string" || circleHandle.length > 100)) ||
                (moduleHandle !== undefined && (typeof moduleHandle !== "string" || moduleHandle.length > 100))
            ) {
                return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
            }
            const safeCircleHandle = typeof circleHandle === "string" ? circleHandle : "";
            const safeModuleHandle = typeof moduleHandle === "string" ? moduleHandle : "";
            const permissionModuleHandle = safeModuleHandle === "shifts" ? "tasks" : safeModuleHandle;

            if (!safeCircleHandle) {
                return NextResponse.json({ authenticated: true, authorized: true });
            }

            const circle = await dependencies.findCircle(safeCircleHandle);
            const userDid = await resolveAuthenticatedViewerDid(dependencies.authenticate);
            if (!circle || !(await dependencies.canReadCircle(userDid, circle))) {
                return neutralCircleNotFound();
            }

            if (!dependencies.isCirclePublished(circle)) {
                const membership = userDid ? await dependencies.getMember(userDid, circle._id) : null;
                const canViewUnpublished = circle.createdBy === userDid || membership?.userGroups?.includes("admins");
                if (!canViewUnpublished) return neutralCircleNotFound();
            }

            const isFundingRoute = safeModuleHandle === "funding";
            if (isFundingRoute && circle.circleType !== "circle") {
                return NextResponse.json({ notFound: true, notFoundType: "module" }, { status: 404 });
            }

            if (!dependencies.isModuleEnabled(circle, safeModuleHandle)) {
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
