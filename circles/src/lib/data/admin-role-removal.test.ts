import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { useFakeNow } from "@/test/hooks";
import { mockDb, namedCollection } from "@/test/mock-db";

const db = mockDb();

const BLOCK_MESSAGE = "Admin changes are blocked while a detach request is pending.";
const getPendingDetachCircleRequest = mock(async (_circleId: string): Promise<unknown> => null);
mock.module("@/lib/data/circle-detach", () => ({ DETACH_ADMIN_CHANGE_BLOCK_MESSAGE: BLOCK_MESSAGE, getPendingDetachCircleRequest }));

const members = new Map<string, Record<string, unknown>>();
const key = (userDid: string, circleId: string) => `${userDid}@${circleId}`;
const getMember = mock(async (userDid: string, circleId: string) => members.get(key(userDid, circleId)) ?? null);
const countAdmins = mock(async (_circleId: string): Promise<number> => 2);
const updateMemberUserGroups = mock(async (_userDid: string, _circleId: string, _groups: string[]) => {});
mock.module("@/lib/data/member", () => ({ getMember, countAdmins, updateMemberUserGroups }));

const removal = await import("./admin-role-removal");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const requests = () => namedCollection(db, "adminRoleRemovalRequests");

const CIRCLE = "circle-1";
const setMember = (userDid: string, userGroups: string[] | undefined) => members.set(key(userDid, CIRCLE), { userDid, circleId: CIRCLE, userGroups });

const seedRequest = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    requests().docs.push({
        _id,
        circleId: CIRCLE,
        targetUserDid: "did:target",
        requestedByDid: "did:requester",
        status: "pending",
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    });
    return _id;
};

beforeEach(() => {
    requests().docs = [];
    members.clear();
    setMember("did:requester", ["admins", "members"]);
    setMember("did:target", ["admins", "members"]);
    getMember.mockClear();
    countAdmins.mockReset();
    countAdmins.mockResolvedValue(2);
    updateMemberUserGroups.mockClear();
    getPendingDetachCircleRequest.mockReset();
    getPendingDetachCircleRequest.mockResolvedValue(null);
});

describe("ADMIN_ROLE_REMOVAL_REQUEST_PENDING_STATUS", () => {
    test("is pending", () => {
        expect(removal.ADMIN_ROLE_REMOVAL_REQUEST_PENDING_STATUS).toBe("pending");
    });
});

describe("getPendingAdminRoleRemovalRequest", () => {
    test("returns the pending request for the member in that circle", async () => {
        const id = seedRequest();

        expect((await removal.getPendingAdminRoleRemovalRequest(CIRCLE, "did:target"))?._id).toEqual(id);
    });

    test("returns null when there is none", async () => {
        expect(await removal.getPendingAdminRoleRemovalRequest(CIRCLE, "did:target")).toBeNull();
    });

    test.each(["approved", "declined"])("ignores %s requests", async (status) => {
        seedRequest({ status });

        expect(await removal.getPendingAdminRoleRemovalRequest(CIRCLE, "did:target")).toBeNull();
    });

    test("ignores requests for other members and other circles", async () => {
        seedRequest({ targetUserDid: "did:other" });
        seedRequest({ circleId: "circle-2" });

        expect(await removal.getPendingAdminRoleRemovalRequest(CIRCLE, "did:target")).toBeNull();
    });

    test("returns the newest pending request", async () => {
        seedRequest({ createdAt: new Date(NOW.getTime() - 60_000) });
        const newest = seedRequest({ createdAt: NOW });

        expect((await removal.getPendingAdminRoleRemovalRequest(CIRCLE, "did:target"))?._id).toEqual(newest);
    });
});

describe("createAdminRoleRemovalRequest", () => {
    const params = { circleId: CIRCLE, targetUserDid: "did:target", requestedByDid: "did:requester" };

    test("records a pending request and reports it as created", async () => {
        const { request, created } = await removal.createAdminRoleRemovalRequest(params);

        expect(created).toBe(true);
        expect(request).toMatchObject({ ...params, status: "pending", createdAt: NOW, updatedAt: NOW });
        expect(requests().docs).toHaveLength(1);
        expect(requests().docs[0]._id.equals(request._id as ObjectId)).toBe(true);
    });

    test("returns the request that is already pending instead of creating another", async () => {
        const id = seedRequest();

        const { request, created } = await removal.createAdminRoleRemovalRequest(params);

        expect(created).toBe(false);
        expect(request._id).toEqual(id);
        expect(requests().docs).toHaveLength(1);
    });

    test("only lets a circle admin ask", async () => {
        setMember("did:requester", ["members"]);

        await expect(removal.createAdminRoleRemovalRequest(params)).rejects.toThrow("Only circle admins can request admin-role removal");
        expect(requests().docs).toHaveLength(0);
    });

    test.each([["not a member", undefined], ["without groups", []]])("refuses a requester who is %s", async (_label, groups) => {
        if (groups === undefined) members.delete(key("did:requester", CIRCLE));
        else setMember("did:requester", groups);

        await expect(removal.createAdminRoleRemovalRequest(params)).rejects.toThrow("Only circle admins can request admin-role removal");
    });

    test("only accepts a target who is currently an admin", async () => {
        setMember("did:target", ["members"]);

        await expect(removal.createAdminRoleRemovalRequest(params)).rejects.toThrow("Target member is not currently an admin");
    });

    test("refuses an unknown target", async () => {
        members.delete(key("did:target", CIRCLE));

        await expect(removal.createAdminRoleRemovalRequest(params)).rejects.toThrow("Target member is not currently an admin");
    });

    test("is blocked while the circle has a pending detach request", async () => {
        getPendingDetachCircleRequest.mockResolvedValue({ _id: "detach-1" });

        await expect(removal.createAdminRoleRemovalRequest(params)).rejects.toThrow(BLOCK_MESSAGE);
        expect(requests().docs).toHaveLength(0);
    });

    test.each([0, 1])("never lets the last admin be removed (%d admins)", async (adminCount) => {
        countAdmins.mockResolvedValue(adminCount);

        await expect(removal.createAdminRoleRemovalRequest(params)).rejects.toThrow("Cannot remove the last admin.");
        expect(requests().docs).toHaveLength(0);
    });

    test("allows a request when there are two admins", async () => {
        countAdmins.mockResolvedValue(2);

        expect((await removal.createAdminRoleRemovalRequest(params)).created).toBe(true);
    });

    test("lets an admin ask for the removal of their own admin role", async () => {
        const { request } = await removal.createAdminRoleRemovalRequest({ ...params, targetUserDid: "did:requester" });

        expect(request.targetUserDid).toBe("did:requester");
    });

    test("checks the requester before the target, and the detach block before the admin count", async () => {
        setMember("did:requester", ["members"]);
        setMember("did:target", ["members"]);
        await expect(removal.createAdminRoleRemovalRequest(params)).rejects.toThrow("Only circle admins");

        setMember("did:requester", ["admins"]);
        getPendingDetachCircleRequest.mockResolvedValue({});
        countAdmins.mockResolvedValue(1);
        setMember("did:target", ["admins"]);
        await expect(removal.createAdminRoleRemovalRequest(params)).rejects.toThrow(BLOCK_MESSAGE);
    });
});

describe("approveAdminRoleRemovalRequest", () => {
    const approve = (id: ObjectId, targetUserDid = "did:target") => removal.approveAdminRoleRemovalRequest({ requestId: id.toString(), targetUserDid });

    test("removes the admin role from the target and marks the request approved", async () => {
        const id = seedRequest();

        const result = await approve(id);

        expect(updateMemberUserGroups).toHaveBeenCalledWith("did:target", CIRCLE, ["members"]);
        expect(result).toMatchObject({ status: "approved", updatedAt: NOW, decidedAt: NOW });
        expect(requests().byId(id)).toMatchObject({ status: "approved", updatedAt: NOW, decidedAt: NOW });
    });

    test("keeps the target's other groups", async () => {
        const id = seedRequest();
        setMember("did:target", ["moderators", "admins", "members"]);

        await approve(id);

        expect(updateMemberUserGroups).toHaveBeenCalledWith("did:target", CIRCLE, ["moderators", "members"]);
    });

    test("only the target admin can approve", async () => {
        const id = seedRequest();

        await expect(approve(id, "did:requester")).rejects.toThrow("Only the target admin can approve this request");

        expect(updateMemberUserGroups).not.toHaveBeenCalled();
        expect(requests().byId(id)?.status).toBe("pending");
    });

    test("cannot approve an unknown or already decided request", async () => {
        await expect(approve(new ObjectId())).rejects.toThrow("Admin removal request not found");

        const decided = seedRequest({ status: "declined" });
        await expect(approve(decided)).rejects.toThrow("Admin removal request not found");
    });

    test("throws for a request id that is not an ObjectId", async () => {
        await expect(removal.approveAdminRoleRemovalRequest({ requestId: "bogus", targetUserDid: "did:target" })).rejects.toThrow();
    });

    test("is blocked while the circle has a pending detach request", async () => {
        const id = seedRequest();
        getPendingDetachCircleRequest.mockResolvedValue({ _id: "detach-1" });

        await expect(approve(id)).rejects.toThrow(BLOCK_MESSAGE);
        expect(updateMemberUserGroups).not.toHaveBeenCalled();
    });

    test("fails when the target is no longer a member", async () => {
        const id = seedRequest();
        members.delete(key("did:target", CIRCLE));

        await expect(approve(id)).rejects.toThrow("Target member not found");
    });

    test("fails when the target is no longer an admin", async () => {
        const id = seedRequest();
        setMember("did:target", ["members"]);

        await expect(approve(id)).rejects.toThrow("Target member is no longer an admin");
    });

    test("never removes the last admin, even if there were two when the request was made", async () => {
        const id = seedRequest();
        countAdmins.mockResolvedValue(1);

        await expect(approve(id)).rejects.toThrow("Cannot remove the last admin.");

        expect(updateMemberUserGroups).not.toHaveBeenCalled();
        expect(requests().byId(id)?.status).toBe("pending");
    });

    test("does not mark the request approved when the role change fails", async () => {
        const id = seedRequest();
        updateMemberUserGroups.mockRejectedValueOnce(new Error("db down"));

        await expect(approve(id)).rejects.toThrow("db down");

        expect(requests().byId(id)?.status).toBe("pending");
    });

    test("cannot be approved twice", async () => {
        const id = seedRequest();
        await approve(id);

        await expect(approve(id)).rejects.toThrow("Admin removal request not found");
        expect(updateMemberUserGroups).toHaveBeenCalledTimes(1);
    });
});

describe("declineAdminRoleRemovalRequest", () => {
    const decline = (id: ObjectId, targetUserDid = "did:target") => removal.declineAdminRoleRemovalRequest({ requestId: id.toString(), targetUserDid });

    test("marks the request declined and leaves the target's groups alone", async () => {
        const id = seedRequest();

        const result = await decline(id);

        expect(result).toMatchObject({ status: "declined", updatedAt: NOW, decidedAt: NOW });
        expect(requests().byId(id)).toMatchObject({ status: "declined", decidedAt: NOW });
        expect(updateMemberUserGroups).not.toHaveBeenCalled();
    });

    test("only the target admin can decline", async () => {
        const id = seedRequest();

        await expect(decline(id, "did:requester")).rejects.toThrow("Only the target admin can decline this request");
        expect(requests().byId(id)?.status).toBe("pending");
    });

    test("cannot decline an unknown or already decided request", async () => {
        await expect(decline(new ObjectId())).rejects.toThrow("Admin removal request not found");

        const decided = seedRequest({ status: "approved" });
        await expect(decline(decided)).rejects.toThrow("Admin removal request not found");
    });

    test("is still possible while a detach request is pending", async () => {
        const id = seedRequest();
        getPendingDetachCircleRequest.mockResolvedValue({ _id: "detach-1" });

        expect((await decline(id)).status).toBe("declined");
    });

    test("frees the target to be asked again", async () => {
        const id = seedRequest();
        await decline(id);

        const { created } = await removal.createAdminRoleRemovalRequest({ circleId: CIRCLE, targetUserDid: "did:target", requestedByDid: "did:requester" });

        expect(created).toBe(true);
    });
});
