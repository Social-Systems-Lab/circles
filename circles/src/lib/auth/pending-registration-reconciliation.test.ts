import assert from "node:assert/strict";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { ObjectId } from "mongodb";
import { inspectPendingRegistrationReconciliation } from "@/lib/auth/pending-registration-reconciliation";

function collection(records: any[]) {
    return {
        find(filter: any = {}) {
            const matched = records.filter((record) =>
                Object.entries(filter).every(([key, expected]: [string, any]) => {
                    const actual = key.split(".").reduce((value, part) => value?.[part], record);
                    if (expected && typeof expected === "object" && "$type" in expected)
                        return typeof actual === "string";
                    if (expected && typeof expected === "object" && "$ne" in expected) return actual !== expected.$ne;
                    return String(actual) === String(expected);
                }),
            );
            return {
                sort() {
                    return this;
                },
                async toArray() {
                    return matched;
                },
            };
        },
        async findOne(filter: any) {
            return (
                records.find((record) =>
                    Object.entries(filter).every(([key, value]) =>
                        Array.isArray(record[key]) && typeof value === "string"
                            ? record[key].includes(value)
                            : String(record[key]) === String(value),
                    ),
                ) ?? null
            );
        },
        async countDocuments(filter: any = {}) {
            return records.filter((record) => Object.entries(filter).every(([key, value]) => record[key] === value))
                .length;
        },
    };
}

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pending-reconciliation-"));
    try {
        const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
        const publicKeyPem = publicKey.export({ type: "pkcs1", format: "pem" }).toString();
        const did = crypto.createHash("sha256").update(publicKeyPem).digest("hex");
        const pendingId = new ObjectId();
        const accountId = new ObjectId();
        const credentialDirectory = path.join(root, did);
        fs.mkdirSync(credentialDirectory);
        fs.writeFileSync(path.join(credentialDirectory, "publicKey.pem"), publicKeyPem);
        fs.writeFileSync(path.join(credentialDirectory, "salt.bin"), crypto.randomBytes(16));
        fs.writeFileSync(path.join(credentialDirectory, "iv.bin"), crypto.randomBytes(16));
        fs.writeFileSync(path.join(credentialDirectory, "privateKey.pem.enc"), "opaque-encrypted-test-material");

        const registrations = [
            {
                _id: pendingId,
                status: "provisioning",
                reservedDid: did,
                normalizedEmail: "recovery-test@example.invalid",
                requestedHandle: "recovery-test",
                reconciliationRequiredAt: new Date(),
                createdAt: new Date(),
            },
        ];
        const circles: any[] = [
            {
                _id: accountId,
                did,
                email: "recovery-test@example.invalid",
                handle: "recovery-test",
                publicKey: publicKeyPem,
                metadata: { pendingRegistrationId: pendingId.toHexString() },
            },
        ];
        const members: any[] = [];
        const chatRooms: any[] = [];
        const chatRoomMembers: any[] = [];
        const chatConversations: any[] = [];
        const chatMessageDocs: any[] = [];
        const membersChatId = new ObjectId();
        const welcomeConversationId = new ObjectId();
        chatRooms.push({ _id: membersChatId, circleId: accountId.toHexString(), handle: "members" });
        chatConversations.push({
            _id: welcomeConversationId,
            handle: `welcome-${did}`,
            participants: [did],
        });
        const didReservations = [{ _id: pendingId.toHexString(), did, createdAt: new Date() }];
        const db = {
            collection(name: string) {
                return collection(
                    name === "pendingRegistrations"
                        ? registrations
                        : name === "circles"
                          ? circles
                          : name === "pendingRegistrationDidReservations"
                            ? didReservations
                            : name === "members"
                              ? members
                              : name === "chatRooms"
                                ? chatRooms
                                : name === "chatRoomMembers"
                                  ? chatRoomMembers
                                  : name === "chatConversations"
                                    ? chatConversations
                                    : name === "chatMessageDocs"
                                      ? chatMessageDocs
                                      : [],
                );
            },
        };
        const [recoverable] = await inspectPendingRegistrationReconciliation(db as any, { usersDirectory: root });
        assert.equal(recoverable.publicKeyMatchesDid, true);
        assert.equal(recoverable.classification, "recoverable_finalize");
        assert.equal(recoverable.didReservationMatches, true);
        assert.equal(recoverable.canonicalHandleMatches, true);
        assert.equal(recoverable.normalizedEmailMatches, true);
        assert.equal(recoverable.accountPublicKeyMatchesDid, true);
        assert.equal(recoverable.permanentAccountIdentityMatches, true);
        assert.equal(recoverable.selfMembershipExists, false);
        assert.equal(recoverable.selfChatMembershipExists, false);
        assert.equal(recoverable.membershipCountMatches, false, "the profile count is independently inspected");
        assert.equal(recoverable.profileInitialized, false);
        assert.equal(recoverable.welcomeConversationExists, true);
        assert.equal(recoverable.welcomeMessageExists, false);
        assert.equal(JSON.stringify(recoverable).includes("opaque-encrypted-test-material"), false);

        members.push({ userDid: did, circleId: accountId.toHexString() });
        chatRoomMembers.push({ userDid: did, chatRoomId: membersChatId.toHexString() });
        chatMessageDocs.push({ conversationId: welcomeConversationId.toHexString(), source: "system_welcome" });
        circles[0].members = 1;
        circles[0].isHuman = true;
        circles[0].metadata.onboardingFlow = "pending-registration-v1";
        circles[0].metadata.pendingRegistrationFinalizationVersion = 1;
        const [completeEffects] = await inspectPendingRegistrationReconciliation(db as any, { usersDirectory: root });
        assert.equal(completeEffects.selfMembershipExists, true);
        assert.equal(completeEffects.selfChatMembershipExists, true);
        assert.equal(completeEffects.membershipCountMatches, true);
        assert.equal(completeEffects.profileInitialized, true);
        assert.equal(completeEffects.welcomeConversationExists, true);
        assert.equal(completeEffects.welcomeMessageExists, true);

        circles.length = 0;
        const [orphan] = await inspectPendingRegistrationReconciliation(db as any, { usersDirectory: root });
        assert.equal(orphan.classification, "manual_review_orphan_credentials");
        assert.equal(orphan.correlatedAccountCount, 0);

        fs.writeFileSync(path.join(credentialDirectory, "publicKey.pem"), "not-the-reserved-public-key");
        const [mismatch] = await inspectPendingRegistrationReconciliation(db as any, { usersDirectory: root });
        assert.equal(mismatch.classification, "manual_review_invalid_public_key");

        const claimId = new ObjectId();
        registrations.push({
            _id: claimId,
            status: "provisioning_claimed",
            reservedDid: null,
            normalizedEmail: "claim-without-did@example.invalid",
            requestedHandle: "claim-without-did",
            reconciliationRequiredAt: new Date(),
            createdAt: new Date(),
        } as any);
        const claims = await inspectPendingRegistrationReconciliation(db as any, { usersDirectory: root });
        const claimWithoutDid = claims.find((record) => record.pendingRegistrationId === claimId.toHexString());
        assert.equal(claimWithoutDid?.classification, "manual_review_claim_without_did");
        assert.equal(claimWithoutDid?.reservedDid, null);
        assert.match(claimWithoutDid?.safeNextAction ?? "", /age alone is not proof/i);
        console.log("pending-registration-reconciliation tests passed");
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
