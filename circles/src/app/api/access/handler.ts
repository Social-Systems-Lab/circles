import type { Circle, Member } from "@/models/models";
import { NextResponse } from "next/server";
import { resolveAuthenticatedViewerDid } from "@/lib/auth/authenticated-viewer";
import { readJsonBodyLimited } from "@/lib/security/bounded-input";
import { hasDelegatedAboutRule, isAboutSettingsEditor } from "@/lib/auth/settings-editor-access";
import { features } from "@/lib/data/constants";

type AccessHandlerDependencies = {
    authenticate: () => Promise<string | undefined>;
    findCircle: (handle: string) => Promise<Circle | null>;
    canReadCircle: (viewerDid: string | undefined, circle: Circle) => Promise<boolean>;
    getMember: (userDid: string, circleId: string) => Promise<Member | null>;
    isCirclePublished: (circle: Circle) => boolean;
    isModuleEnabled: (circle: Circle, moduleHandle: string) => boolean;
    canEditAbout: (viewerDid: string, circleId: string) => Promise<boolean>;
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
            const { circleHandle, moduleHandle, settingsEditor } = body.value as {
                circleHandle?: unknown;
                moduleHandle?: unknown;
                settingsEditor?: unknown;
            };
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

            let membership: Member | null | undefined;
            if (!dependencies.isCirclePublished(circle)) {
                if (!userDid) return neutralCircleNotFound();
                if (circle.createdBy !== userDid) {
                    membership = await dependencies.getMember(userDid, circle._id);
                    if (!membership?.userGroups?.includes("admins")) return neutralCircleNotFound();
                }
            }

            const isFundingRoute = safeModuleHandle === "funding";
            if (isFundingRoute && circle.circleType !== "circle") {
                return NextResponse.json({ notFound: true, notFoundType: "module" }, { status: 404 });
            }

            if (!dependencies.isModuleEnabled(circle, safeModuleHandle)) {
                return NextResponse.json({ notFound: true, notFoundType: "module" }, { status: 404 });
            }

            const isSettingsRoute = safeModuleHandle === "settings";
            const defaultViewGroups = isSettingsRoute
                ? (features.settings.view.defaultUserGroups ?? [])
                : isFundingRoute
                  ? ["admins", "moderators", "members"]
                  : ["everyone"];
            const allowedUserGroups = circle.accessRules?.[permissionModuleHandle]?.view ?? defaultViewGroups;
            if (isSettingsRoute && !userDid) return NextResponse.json({ authenticated: false, authorized: false });

            if (allowedUserGroups.includes("everyone")) {
                return NextResponse.json({ authenticated: true, authorized: true });
            }
            if (!userDid) return NextResponse.json({ authenticated: false, authorized: false });

            if (membership === undefined) membership = await dependencies.getMember(userDid, circle._id);
            const canViewModule = allowedUserGroups.some((group) => membership?.userGroups?.includes(group));
            const canOpenEditor =
                !canViewModule &&
                isSettingsRoute &&
                isAboutSettingsEditor(settingsEditor) &&
                hasDelegatedAboutRule(circle) &&
                !!circle._id &&
                (circle.circleType !== "user" || circle.did === userDid) &&
                (await dependencies.canEditAbout(userDid, circle._id));
            return NextResponse.json({ authenticated: true, authorized: canViewModule || canOpenEditor });
        } catch (error) {
            console.error("Error in /api/access:", error);
            return NextResponse.json({ error: true }, { status: 500 });
        }
    };
