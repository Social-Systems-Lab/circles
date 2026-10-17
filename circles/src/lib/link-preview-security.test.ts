import assert from "node:assert/strict";
// @ts-expect-error Bun provides module types at runtime; this repository does not install them.
import { test } from "bun:test";
import {
    fetchPublicPreviewResource,
    isPublicIpAddress,
    LINK_PREVIEW_HEADERS,
    parsePublicPreviewUrl,
    resolvePublicDestination,
    runAuthenticatedLinkPreview,
    type LinkPreviewDependencies,
    type ResolvedAddress,
} from "./link-preview-security";

const publicAddress: ResolvedAddress = { address: "93.184.216.34", family: 4 };
const html =
    "<html><head><title>Public title</title><meta name=description content='Public description'></head></html>";

const response = (status = 200, headers: Record<string, string> = { "content-type": "text/html" }, data = html) => ({
    status,
    headers,
    data,
});

const dependencies = (overrides: Partial<LinkPreviewDependencies> = {}): LinkPreviewDependencies => ({
    resolve: async () => [publicAddress],
    request: async () => response(),
    ...overrides,
});

test("unauthenticated preview actions are rejected before DNS or network access", async () => {
    let requests = 0;
    const result = await runAuthenticatedLinkPreview("https://public.example", async () => undefined, {
        resolve: async () => {
            requests += 1;
            return [publicAddress];
        },
    });
    assert.deepEqual(result, { success: false, error: "Authentication required." });
    assert.equal(requests, 0);
});

test("public HTTP and HTTPS URLs are accepted and preserve the preview response contract", async () => {
    for (const url of ["http://public.example/article", "https://public.example/article"]) {
        const result = await runAuthenticatedLinkPreview(url, async () => "did:viewer", dependencies());
        assert.equal(result.success, true);
        assert.deepEqual(result.preview, {
            url,
            title: "Public title",
            description: "Public description",
            image: undefined,
            mediaType: "website",
            contentType: "text/html",
            favicons: [`${new URL(url).origin}/favicon.ico`],
        });
    }
});

test("non-public IPv4 ranges are rejected", () => {
    for (const address of [
        "0.0.0.0",
        "10.0.0.1",
        "100.64.0.1",
        "127.0.0.1",
        "169.254.169.254",
        "169.254.1.1",
        "172.16.0.1",
        "192.168.1.1",
        "192.0.2.1",
        "198.18.0.1",
        "198.51.100.1",
        "203.0.113.1",
        "224.0.0.1",
        "255.255.255.255",
    ]) {
        assert.equal(isPublicIpAddress(address), false, address);
    }
    assert.equal(isPublicIpAddress(publicAddress.address), true);
});

test("IPv6 loopback, link-local, ULA, mapped-private, and documentation addresses are rejected", () => {
    for (const address of ["::1", "fe80::1", "fc00::1", "fd12::1", "::ffff:127.0.0.1", "2001:db8::1"]) {
        assert.equal(isPublicIpAddress(address), false, address);
    }
    assert.equal(isPublicIpAddress("2606:2800:220:1:248:1893:25c8:1946"), true);
});

test("URL parser canonicalizes encoded numeric IP bypass forms before classification", async () => {
    for (const input of [
        "http://2130706433/",
        "http://0177.0.0.1/",
        "http://0x7f000001/",
        "http://127.1/",
        "http://[::ffff:7f00:1]/",
    ]) {
        await assert.rejects(() => resolvePublicDestination(parsePublicPreviewUrl(input)), /not public/);
    }
});

test("localhost and internal service hostnames resolving privately are rejected", async () => {
    for (const hostname of ["localhost", "minio", "qdrant", "nginx", "circles"]) {
        await assert.rejects(
            () =>
                resolvePublicDestination(new URL(`http://${hostname}/`), async () => [
                    { address: "172.18.0.3", family: 4 },
                ]),
            /not public/,
        );
    }
});

test("a hostname with any private DNS answer is rejected, while all-public answers are allowed", async () => {
    await assert.rejects(
        () =>
            resolvePublicDestination(new URL("https://mixed.example"), async () => [
                publicAddress,
                { address: "10.0.0.2", family: 4 },
            ]),
        /not public/,
    );
    assert.deepEqual(
        await resolvePublicDestination(new URL("https://public.example"), async () => [
            publicAddress,
            { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
        ]),
        publicAddress,
    );
});

test("public to private redirects are rejected before the private request", async () => {
    const requested: string[] = [];
    await assert.rejects(
        () =>
            fetchPublicPreviewResource("https://public.example", {
                resolve: async (hostname) =>
                    hostname === "private.example" ? [{ address: "169.254.169.254", family: 4 }] : [publicAddress],
                request: async (url) => {
                    requested.push(url.href);
                    return response(302, { location: "http://private.example/latest/meta-data" });
                },
            }),
        /not public/,
    );
    assert.deepEqual(requested, ["https://public.example/"]);
});

test("public cross-host redirects are allowed and validated at every hop", async () => {
    const resolved: string[] = [];
    const requested: string[] = [];
    const resource = await fetchPublicPreviewResource("http://one.example/start", {
        resolve: async (hostname) => {
            resolved.push(hostname);
            return [publicAddress];
        },
        request: async (url) => {
            requested.push(url.href);
            return requested.length === 1 ? response(301, { location: "https://two.example/final" }) : response();
        },
    });
    assert.deepEqual(resolved, ["one.example", "two.example"]);
    assert.deepEqual(requested, ["http://one.example/start", "https://two.example/final"]);
    assert.equal(resource.url, "https://two.example/final");
});

test("redirect chains are bounded", async () => {
    let requests = 0;
    await assert.rejects(
        () =>
            fetchPublicPreviewResource("https://public.example/0", {
                ...dependencies(),
                request: async (url) => {
                    requests += 1;
                    return response(302, { location: String(Number(url.pathname.slice(1)) + 1) });
                },
            }),
        /Too many redirects/,
    );
    assert.equal(requests, 6);
});

test("the request uses the already-validated address, preventing a second DNS lookup/rebinding", async () => {
    let resolutions = 0;
    let pinned: ResolvedAddress | undefined;
    let sentHeaders: Record<string, string> | undefined;
    await fetchPublicPreviewResource("https://rebind.example", {
        resolve: async () => {
            resolutions += 1;
            return [publicAddress];
        },
        request: async (_url, address, _timeout, headers) => {
            pinned = address;
            sentHeaders = headers;
            return response();
        },
    });
    assert.equal(resolutions, 1);
    assert.deepEqual(pinned, publicAddress);
    assert.deepEqual(sentHeaders, LINK_PREVIEW_HEADERS);
    assert.equal("cookie" in (sentHeaders ?? {}), false);
    assert.equal("authorization" in (sentHeaders ?? {}), false);
});

test("credentials and non-HTTP protocols are rejected", () => {
    assert.throws(() => parsePublicPreviewUrl("https://user:password@public.example"), /credentials/);
    for (const input of ["file:///etc/passwd", "ftp://public.example/file", "gopher://127.0.0.1"]) {
        assert.throws(() => parsePublicPreviewUrl(input), /protocol/);
    }
});

test("blocked metadata destinations cannot be returned through a preview", async () => {
    const result = await runAuthenticatedLinkPreview(
        "http://169.254.169.254/latest/meta-data",
        async () => "did:viewer",
        {
            request: async () => response(200, {}, "secret metadata"),
        },
    );
    assert.deepEqual(result, { success: false, error: "Failed to fetch link preview." });
});
