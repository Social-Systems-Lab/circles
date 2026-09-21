import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { silenceConsole, useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const requests = await import("./membership-requests");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const circleId = new ObjectId();

const consoleSpy = silenceConsole("error");

const seed = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.MembershipRequests.docs.push({ _id, userDid: "did:user", circleId: circleId.toString(), status: "pending", requestedAt: NOW, ...overrides });
    return _id;
};
const stored = (id: ObjectId) => db.MembershipRequests.byId(id)!;

beforeEach(() => {
    db.MembershipRequests.docs = [];
    db.MembershipRequests.aggregations = [];
    db.MembershipRequests.onAggregate = undefined;
});

describe("getAllMembershipRequests", () => {
    const row = (status: string, requestedAt = NOW) => ({ _id: `id-${status}`, userDid: "did:user", circleId: circleId.toString(), status, requestedAt, name: "Vee" });

    test("returns nothing for a missing circle id, without querying", async () => {
        expect(await requests.getAllMembershipRequests("")).toEqual({ pendingRequests: [], rejectedRequests: [] });
        expect(db.MembershipRequests.aggregations).toHaveLength(0);
    });

    test("returns nothing, and logs, for an id that is not an ObjectId", async () => {
        expect(await requests.getAllMembershipRequests("bogus")).toEqual({ pendingRequests: [], rejectedRequests: [] });

        expect(consoleSpy.error).toHaveBeenCalledWith("Invalid circleId:", "bogus");
        expect(db.MembershipRequests.aggregations).toHaveLength(0);
    });

    test("splits the requests of the circle into pending and rejected", async () => {
        db.MembershipRequests.onAggregate = () => [row("pending"), row("rejected"), row("approved")];

        const result = await requests.getAllMembershipRequests(circleId.toString());

        expect(result.pendingRequests.map((r) => r.status)).toEqual(["pending"]);
        expect(result.rejectedRequests.map((r) => r.status)).toEqual(["rejected"]);
    });

    test("leaves approved requests out of both lists", async () => {
        db.MembershipRequests.onAggregate = () => [row("approved")];

        expect(await requests.getAllMembershipRequests(circleId.toString())).toEqual({ pendingRequests: [], rejectedRequests: [] });
    });

    test("keeps the order the query returned", async () => {
        db.MembershipRequests.onAggregate = () => [
            { ...row("pending"), _id: "b" },
            { ...row("pending"), _id: "a" },
        ];

        expect((await requests.getAllMembershipRequests(circleId.toString())).pendingRequests.map((r) => r._id)).toEqual(["b", "a"]);
    });

    test("asks for this circle's requests joined with the requester's profile, newest first", async () => {
        db.MembershipRequests.onAggregate = () => [];

        await requests.getAllMembershipRequests(circleId.toString());

        const [pipeline] = db.MembershipRequests.aggregations;
        expect(pipeline[0]).toEqual({ $match: { circleId: circleId.toString() } });
        expect(pipeline[1]).toEqual({ $lookup: { from: "circles", localField: "userDid", foreignField: "did", as: "userDetails" } });
        expect(pipeline[2]).toEqual({ $unwind: "$userDetails" });
        expect(pipeline[pipeline.length - 1]).toEqual({ $sort: { requestedAt: -1 } });
    });

    test("projects the requester's name, email and picture and the questionnaire answers", async () => {
        db.MembershipRequests.onAggregate = () => [];

        await requests.getAllMembershipRequests(circleId.toString());

        const projection = db.MembershipRequests.aggregations[0].find((stage) => "$project" in stage)!.$project;
        expect(projection).toMatchObject({
            _id: { $toString: "$_id" },
            questionnaireAnswers: 1,
            name: "$userDetails.name",
            email: "$userDetails.email",
            picture: "$userDetails.picture",
        });
    });
});

describe("getUserPendingMembershipRequests", () => {
    test("returns nothing without a user did, without querying", async () => {
        expect(await requests.getUserPendingMembershipRequests("")).toEqual([]);
        expect(db.MembershipRequests.aggregations).toHaveLength(0);
    });

    test("returns only the pending requests the query found", async () => {
        db.MembershipRequests.onAggregate = () => [
            { _id: "1", status: "pending" },
            { _id: "2", status: "rejected" },
            { _id: "3", status: "approved" },
        ];

        expect((await requests.getUserPendingMembershipRequests("did:user")).map((r) => r._id)).toEqual(["1"]);
    });

    test("asks for the user's requests joined with their profile", async () => {
        db.MembershipRequests.onAggregate = () => [];

        await requests.getUserPendingMembershipRequests("did:user");

        const [pipeline] = db.MembershipRequests.aggregations;
        expect(pipeline[0]).toEqual({ $match: { userDid: "did:user" } });
        expect(pipeline[1].$lookup).toMatchObject({ from: "circles", localField: "userDid", foreignField: "did" });
    });
});

describe("getMembershipRequest", () => {
    test("returns the request", async () => {
        const id = seed({ questionnaireAnswers: { why: "to help" } });

        expect(await requests.getMembershipRequest(id.toString())).toMatchObject({ userDid: "did:user", questionnaireAnswers: { why: "to help" } });
    });

    test("throws when it does not exist", async () => {
        await expect(requests.getMembershipRequest(new ObjectId().toString())).rejects.toThrow("Membership request not found");
    });

    test("throws for an id that is not an ObjectId", async () => {
        await expect(requests.getMembershipRequest("bogus")).rejects.toThrow();
    });
});

describe("createPendingMembershipRequest", () => {
    test("stores a pending request with the answers and returns it", async () => {
        const request = await requests.createPendingMembershipRequest("did:user", "c1", { why: "to help" });

        expect(request).toEqual({ userDid: "did:user", circleId: "c1", status: "pending", requestedAt: NOW, questionnaireAnswers: { why: "to help" } });
        expect(db.MembershipRequests.docs).toHaveLength(1);
        expect(db.MembershipRequests.docs[0]).toMatchObject({ userDid: "did:user", circleId: "c1", status: "pending" });
    });

    test("works without answers", async () => {
        const request = await requests.createPendingMembershipRequest("did:user", "c1");

        expect(request.questionnaireAnswers).toBeUndefined();
    });

    test("refuses a second pending request for the same user and circle", async () => {
        await requests.createPendingMembershipRequest("did:user", "c1");

        await expect(requests.createPendingMembershipRequest("did:user", "c1")).rejects.toThrow(
            "A pending request already exists for this user and circle",
        );
        expect(db.MembershipRequests.docs).toHaveLength(1);
    });

    test("allows requests for different circles or from different users", async () => {
        await requests.createPendingMembershipRequest("did:user", "c1");
        await requests.createPendingMembershipRequest("did:user", "c2");
        await requests.createPendingMembershipRequest("did:other", "c1");

        expect(db.MembershipRequests.docs).toHaveLength(3);
    });

    test("allows a new request after the earlier one was rejected or approved", async () => {
        seed({ circleId: "c1", status: "rejected" });
        seed({ circleId: "c1", status: "approved" });

        await requests.createPendingMembershipRequest("did:user", "c1");

        expect(db.MembershipRequests.docs).toHaveLength(3);
    });
});

describe("deletePendingMembershipRequest", () => {
    test("deletes the pending request and reports true", async () => {
        seed({ circleId: "c1" });

        expect(await requests.deletePendingMembershipRequest("did:user", "c1")).toBe(true);
        expect(db.MembershipRequests.docs).toHaveLength(0);
    });

    test("throws when there is no pending request", async () => {
        await expect(requests.deletePendingMembershipRequest("did:user", "c1")).rejects.toThrow("No pending request found for this user and circle");
    });

    test("never deletes rejected or approved requests", async () => {
        seed({ circleId: "c1", status: "rejected" });
        seed({ circleId: "c1", status: "approved" });

        await expect(requests.deletePendingMembershipRequest("did:user", "c1")).rejects.toThrow();
        expect(db.MembershipRequests.docs).toHaveLength(2);
    });

    test("only deletes the request of that user for that circle", async () => {
        seed({ circleId: "c1" });
        const other = seed({ circleId: "c1", userDid: "did:other" });

        await requests.deletePendingMembershipRequest("did:user", "c1");

        expect(db.MembershipRequests.docs.map((doc) => doc._id)).toEqual([other]);
    });
});

describe("updatePendingMembershipRequestStatus", () => {
    test("approves a pending request and records when", async () => {
        const id = seed();

        const result = await requests.updatePendingMembershipRequestStatus(id.toString(), "approved");

        expect(result).toMatchObject({ status: "approved", approvedAt: NOW });
        expect(result.rejectedAt).toBeUndefined();
        expect(stored(id)).toMatchObject({ status: "approved", approvedAt: NOW });
    });

    test("rejects a pending request and records when", async () => {
        const id = seed();

        const result = await requests.updatePendingMembershipRequestStatus(id.toString(), "rejected");

        expect(result).toMatchObject({ status: "rejected", rejectedAt: NOW });
        expect(result.approvedAt).toBeUndefined();
        expect(stored(id)).toMatchObject({ status: "rejected", rejectedAt: NOW });
    });

    test("keeps the rest of the request", async () => {
        const id = seed({ questionnaireAnswers: { why: "to help" } });

        const result = await requests.updatePendingMembershipRequestStatus(id.toString(), "approved");

        expect(result).toMatchObject({ userDid: "did:user", circleId: circleId.toString(), questionnaireAnswers: { why: "to help" } });
    });

    test.each(["rejected", "approved"])("cannot change a request that is already %s", async (status) => {
        const id = seed({ status });

        await expect(requests.updatePendingMembershipRequestStatus(id.toString(), "approved")).rejects.toThrow("Pending membership request not found");

        expect(stored(id).status).toBe(status);
    });

    test("throws for an unknown request or an id that is not an ObjectId", async () => {
        await expect(requests.updatePendingMembershipRequestStatus(new ObjectId().toString(), "approved")).rejects.toThrow("Pending membership request not found");
        await expect(requests.updatePendingMembershipRequestStatus("bogus", "approved")).rejects.toThrow();
    });

    test("only changes the given request", async () => {
        const target = seed();
        const other = seed({ userDid: "did:other" });

        await requests.updatePendingMembershipRequestStatus(target.toString(), "approved");

        expect(stored(other).status).toBe("pending");
    });
});
