import { describe, expect, test } from "bun:test";
import { TEST_ORIGIN, createBearerRequest, createJsonRequest, createRequest } from "./next-request";

describe("createRequest", () => {
    test("builds a GET request against the test origin by default", () => {
        const request = createRequest();

        expect(request.method).toBe("GET");
        expect(request.url).toBe(`${TEST_ORIGIN}/`);
    });

    test("resolves paths, including query strings, against the test origin", () => {
        const request = createRequest("/api/x?q=1");

        expect(request.nextUrl.pathname).toBe("/api/x");
        expect(request.nextUrl.searchParams.get("q")).toBe("1");
        expect(request.nextUrl.origin).toBe(TEST_ORIGIN);
    });

    test("keeps an absolute url as given", () => {
        expect(createRequest("https://other.example/a").nextUrl.origin).toBe("https://other.example");
    });

    test("passes the method, headers and body through", async () => {
        const request = createRequest("/", { method: "PUT", headers: { "x-test": "1" }, body: "payload" });

        expect(request.method).toBe("PUT");
        expect(request.headers.get("x-test")).toBe("1");
        expect(await request.text()).toBe("payload");
    });
});

describe("createJsonRequest", () => {
    test("posts the serialized body with a JSON content type", async () => {
        const request = createJsonRequest({ a: 1 });

        expect(request.method).toBe("POST");
        expect(request.headers.get("content-type")).toBe("application/json");
        expect(await request.json()).toEqual({ a: 1 });
    });

    test("sends a string body untouched, so malformed JSON can be tested", async () => {
        const request = createJsonRequest("{not json");

        expect(await request.text()).toBe("{not json");
    });

    test("supports a path, method and extra headers", () => {
        const request = createJsonRequest({}, { path: "/api/y", method: "PATCH", headers: { "x-test": "1" } });

        expect(request.nextUrl.pathname).toBe("/api/y");
        expect(request.method).toBe("PATCH");
        expect(request.headers.get("x-test")).toBe("1");
        expect(request.headers.get("content-type")).toBe("application/json");
    });

    test("serializes null and arrays", async () => {
        expect(await createJsonRequest(null).json()).toBeNull();
        expect(await createJsonRequest([1, 2]).json()).toEqual([1, 2]);
    });
});

describe("cookies", () => {
    test("are readable through request.cookies", () => {
        const request = createRequest("/", { cookies: { session: "abc", theme: "dark" } });

        expect(request.cookies.get("session")?.value).toBe("abc");
        expect(request.cookies.get("theme")?.value).toBe("dark");
        expect(request.cookies.get("missing")).toBeUndefined();
    });

    test("are exposed as a single cookie header", () => {
        const request = createRequest("/", { cookies: { session: "abc", theme: "dark" } });

        expect(request.headers.get("cookie")).toBe("session=abc; theme=dark");
        expect(request.headers.get("Cookie")).toBe("session=abc; theme=dark");
        expect(request.headers.has("cookie")).toBe(true);
    });

    test("leave the other headers working", () => {
        const request = createRequest("/", { headers: { "x-test": "1" }, cookies: { session: "abc" } });

        expect(request.headers.get("x-test")).toBe("1");
        expect(request.headers.has("x-test")).toBe(true);
        expect(request.headers.has("x-missing")).toBe(false);
        expect([...request.headers.keys()]).toContain("x-test");
    });

    test("are absent when none are given", () => {
        const request = createRequest("/");

        expect(request.cookies.getAll()).toEqual([]);
        expect(request.headers.get("cookie")).toBeNull();
        expect(createRequest("/", { cookies: {} }).cookies.getAll()).toEqual([]);
    });

    test("are supported on JSON requests", async () => {
        const request = createJsonRequest({ a: 1 }, { cookies: { session: "abc" } });

        expect(request.cookies.get("session")?.value).toBe("abc");
        expect(await request.json()).toEqual({ a: 1 });
    });
});

describe("createBearerRequest", () => {
    test("adds a bearer authorization header", () => {
        expect(createBearerRequest("secret").headers.get("authorization")).toBe("Bearer secret");
    });

    test("keeps other options and lets later headers add to it", () => {
        const request = createBearerRequest("secret", { method: "POST", path: "/api/z", headers: { "x-test": "1" } });

        expect(request.method).toBe("POST");
        expect(request.nextUrl.pathname).toBe("/api/z");
        expect(request.headers.get("x-test")).toBe("1");
        expect(request.headers.get("authorization")).toBe("Bearer secret");
    });
});
