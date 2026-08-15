import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { Circles } from "@/lib/data/db";

export async function isSuperAdminDid(userDid: string | undefined): Promise<boolean> {
    if (!userDid) return false;
    const user = await Circles.findOne({ did: userDid, circleType: "user" }, { projection: { isAdmin: 1 } });
    return user?.isAdmin === true;
}

export async function requireSuperAdmin(): Promise<string> {
    const userDid = await getAuthenticatedUserDid();
    if (!(await isSuperAdminDid(userDid))) {
        throw new Error("Unauthorized: superadmin access required.");
    }
    return userDid!;
}
