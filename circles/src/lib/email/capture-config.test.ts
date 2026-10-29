import assert from "node:assert/strict";
import {
    enforceEmailConfigurationAtBoot,
    getCaptureConfiguration,
    mayLogSensitiveDevelopmentEmailLinks,
    requireCaptureConfiguration,
} from "./capture-config";

const validEnvironment = {
    EMAIL_TRANSPORT: "capture",
    EMAIL_CAPTURE_ENABLED: "true",
    KAMOONI_DEPLOYMENT_ENV: "staging",
    NODE_ENV: "production",
    CIRCLES_URL: "https://staging.kamooni.org",
    NEXT_PUBLIC_APP_URL: "https://staging.kamooni.org",
};

assert.deepEqual(getCaptureConfiguration({}), { enabled: false });
assert.deepEqual(getCaptureConfiguration(validEnvironment), {
    enabled: true,
    origin: "https://staging.kamooni.org",
});
assert.equal(
    "error" in getCaptureConfiguration({ CIRCLES_URL: "https://staging.kamooni.org" }),
    true,
    "staging refuses to boot without explicit capture controls",
);

for (const environment of [
    { ...validEnvironment, CIRCLES_URL: "https://kamooni.org" },
    { ...validEnvironment, EMAIL_CAPTURE_ENABLED: "false" },
    { ...validEnvironment, KAMOONI_DEPLOYMENT_ENV: "production" },
    { ...validEnvironment, NODE_ENV: "development" },
    { ...validEnvironment, CIRCLES_DEV_LOG_PASSWORD_RESET: "true" },
    { ...validEnvironment, POSTMARK_API_TOKEN: "configured" },
    { ...validEnvironment, NEXT_PUBLIC_APP_URL: "https://kamooni.org" },
]) {
    const result = getCaptureConfiguration(environment);
    assert.equal(result.enabled, false);
    assert.equal("error" in result, true, "unsafe capture configuration is refused");
    assert.throws(() => requireCaptureConfiguration(environment));
    assert.throws(() => enforceEmailConfigurationAtBoot(environment), "startup refuses unsafe capture");
}

assert.equal(mayLogSensitiveDevelopmentEmailLinks({ NODE_ENV: "development" }), true);
assert.equal(
    mayLogSensitiveDevelopmentEmailLinks({
        NODE_ENV: "development",
        EMAIL_TRANSPORT: "capture",
        CIRCLES_URL: "https://staging.kamooni.org",
    }),
    false,
    "capture intent suppresses sensitive development-link logging even before configuration validation",
);

console.log("email capture configuration tests passed");
