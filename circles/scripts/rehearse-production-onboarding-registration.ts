// Invoked only in the disposable rehearsal's exact-SHA registration operator image.
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { permanentSignupAccountExists } from "@/lib/auth/email-normalization";
import {
    getPendingRegistrationCollections,
    getVerifiedPendingRegistration,
    requestPendingRegistrationRecovery,
    startPendingRegistration,
    verifyPendingRegistrationEmail,
    type PendingRegistrationDependencies,
} from "@/lib/auth/pending-registration";
import { getRegistrationRouting, isRegistrationRoutingAllowed } from "@/lib/auth/registration-routing";

const uri = "mongodb://rehearsal:rehearsal-not-a-credential@db:27017/circles?authSource=admin";
const phase = process.argv.at(-1);
assert(process.env.MONGODB_URI === uri && process.env.REGISTRATION_DEPLOYMENT_ID ===
    "production-onboarding-20261113-rehearsal-01", "Disposable registration fixture required");
assert(phase === "seed" || phase === "verify", "Choose a registration rehearsal phase");

const client = new MongoClient(uri);
try {
    const db = client.db("circles");
    assert(isRegistrationRoutingAllowed(await getRegistrationRouting(db.collection("registrationRouting")), "pending"),
        "The disposable operator must explicitly open pending signup");

    let verificationLink = "";
    const unexpectedProvisioning = async () => {
        throw new Error("Link verification and recovery must not provision any account");
    };
    const dependencies: PendingRegistrationDependencies = {
        collections: await getPendingRegistrationCollections(db),
        sendVerificationEmail: async ({ verificationUrl }) => {
            verificationLink = verificationUrl;
        },
        permanentAccountExists: (email, handle) => permanentSignupAccountExists(db.collection("circles"), email, handle),
        findAccountByPendingRegistrationId: unexpectedProvisioning,
        validateProvisionedAccount: unexpectedProvisioning,
        provisionAccount: unexpectedProvisioning,
        finalizeAccount: unexpectedProvisioning,
        issueSession: unexpectedProvisioning,
        baseUrl: "https://kamooni.invalid",
    };

    function takeVerificationToken() {
        assert(verificationLink, "Expected a captured verification link");
        const token = new URL(verificationLink).searchParams.get("token");
        assert(token, "Expected a verification capability");
        verificationLink = "";
        return token;
    }

    const liveEmail = "rehearsal-live-link@example.invalid";
    const recoveryEmail = "rehearsal-expired-continuation@example.invalid";
    const clientIp = "192.0.2.1";

    if (phase === "seed") {
        const live = await startPendingRegistration(
            { name: "Rehearsal Live Link", email: liveEmail, requestedHandle: "rehearsal-live-link", clientIp },
            dependencies,
        );
        const liveToken = takeVerificationToken();
        const earlier = new Date(Date.now() - 31 * 60 * 1000);
        const earlierDependencies = { ...dependencies, now: () => earlier };
        const recovery = await startPendingRegistration(
            { name: "Rehearsal Recovery", email: recoveryEmail, requestedHandle: "rehearsal-recovery", clientIp },
            earlierDependencies,
        );
        const verified = await verifyPendingRegistrationEmail(takeVerificationToken(), earlierDependencies);
        assert(verified.success && verified.pendingRegistrationId === recovery.pendingRegistrationId &&
            verified.verifiedContinuationSecret, "Expected the original recovery fixture to verify");
        // These synthetic capabilities go to a private disposable fixture file, not the job log.
        console.log(JSON.stringify({
            liveId: live.pendingRegistrationId,
            liveToken,
            recoveryId: recovery.pendingRegistrationId,
            expiredContinuation: verified.verifiedContinuationSecret,
        }));
    } else {
        const saved = JSON.parse(process.env.REHEARSAL_REGISTRATION_LINKS ?? "");
        const original = await verifyPendingRegistrationEmail(saved.liveToken, dependencies);
        assert(original.success && original.pendingRegistrationId === saved.liveId && original.verifiedContinuationSecret,
            "The original unexpired link must verify the same pending record after deployment");
        assert((await getVerifiedPendingRegistration(saved.liveId, original.verifiedContinuationSecret, dependencies)).success,
            "The original link must produce a usable continuation");

        const expired = await getVerifiedPendingRegistration(saved.recoveryId, saved.expiredContinuation, dependencies);
        assert(!expired.success, "The old continuation must stay expired");
        await requestPendingRegistrationRecovery({ email: recoveryEmail, clientIp }, dependencies);
        const recovered = await verifyPendingRegistrationEmail(takeVerificationToken(), dependencies);
        assert(recovered.success && recovered.pendingRegistrationId === saved.recoveryId && recovered.verifiedContinuationSecret,
            "Recovery must verify the same retained registration");
        assert((await getVerifiedPendingRegistration(saved.recoveryId, recovered.verifiedContinuationSecret, dependencies)).success,
            "Recovery must issue a usable continuation");
        console.log("Verification and recovery links survived the disposable paused deployment.");
    }
} finally {
    await client.close();
}
