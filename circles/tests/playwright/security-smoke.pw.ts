import { expect, test } from "@playwright/test";

test("version endpoint exposes build metadata without caching", async ({ request }) => {
    const response = await request.get("/api/version");
    expect(response.ok()).toBeTruthy();

    const payload = await response.json();
    expect(payload).toEqual(
        expect.objectContaining({
            version: expect.any(String),
            gitSha: expect.any(String),
            buildTime: expect.any(String),
        }),
    );
    expect(response.headers()["cache-control"]).toContain("no-store");
});

test("public API responses include baseline security headers", async ({ request }) => {
    const response = await request.get("/api/version");
    expect(response.ok()).toBeTruthy();

    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["permissions-policy"]).toBeTruthy();
});

test("image optimizer rejects unconfigured remote origins", async ({ request }) => {
    const target = encodeURIComponent("http://169.254.169.254/latest/meta-data/");
    const response = await request.get(`/_next/image?url=${target}&w=64&q=75`);

    expect([400, 403]).toContain(response.status());
});
