import { getCircleByHandle, getDefaultCircle } from "@/lib/data/circle";
import { getMember } from "@/lib/data/member";
import { Circle } from "@/models/models";
import { NextResponse } from "next/server";
import { features, pageFeaturePrefix } from "@/lib/data/constants";
import { isModuleEnabled } from "@/lib/auth/client-auth";

export async function POST(req: Request) {
    try {
        const { userDid, circleHandle, moduleHandle } = await req.json();

        // get circle
        let circle: Circle | null = null;
        if (circleHandle) {
            circle = await getCircleByHandle(circleHandle);
        } else {
            // user is authorized
            return NextResponse.json({ authenticated: true, authorized: true });
        }

        if (!circle) {
            return NextResponse.json({ notFound: true }, { status: 404 });
        }

        // Check if module is enabled using enabledModules or pages
        const moduleEnabled = isModuleEnabled(circle, moduleHandle);
        if (!moduleEnabled) {
            return NextResponse.json({ notFound: true }, { status: 404 });
        }

        // Check access rules
        const accessRules = circle.accessRules || {};

        // First try module-specific access rule
        let allowedUserGroups = accessRules[moduleHandle].view;

        // If still not found, use default permissions for everyone
        if (!allowedUserGroups) {
            allowedUserGroups = ["everyone"];
        }

        // if the module allows access to "everyone", consider it authorized
        if (allowedUserGroups.includes("everyone")) {
            return NextResponse.json({ authenticated: true, authorized: true });
        }

        // otherwise the user needs to be authenticated
        if (!userDid) {
            return NextResponse.json({ authenticated: false, authorized: false });
        }

        // check if user is in the user group that has access
        const membership = await getMember(userDid, circle._id);
        if (!membership) {
            return NextResponse.json({ authenticated: true, authorized: false });
        }

        const isUserAuthorized = allowedUserGroups.some((group) => membership.userGroups?.includes(group));
        return NextResponse.json({ authenticated: true, authorized: isUserAuthorized });
    } catch (error) {
        console.error("Error in /api/access:", error);
        return NextResponse.json({ error: true }, { status: 500 });
    }
}
