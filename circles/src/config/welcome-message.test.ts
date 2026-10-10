import assert from "node:assert/strict";
import test from "node:test";
import { getWelcomeMessageOrigin } from "@/config/welcome-message";

test("welcome links use the production fallback when CIRCLES_URL is missing", () => {
    const original = process.env.CIRCLES_URL;
    try {
        delete process.env.CIRCLES_URL;
        assert.equal(getWelcomeMessageOrigin(), "https://kamooni.org");
    } finally {
        if (original === undefined) delete process.env.CIRCLES_URL;
        else process.env.CIRCLES_URL = original;
    }
});

test("welcome links use a normalized HTTP(S) origin with a safe fallback", () => {
    assert.equal(getWelcomeMessageOrigin("https://kamooni.org"), "https://kamooni.org");
    assert.equal(getWelcomeMessageOrigin("https://kamooni.org/"), "https://kamooni.org");
    assert.equal(getWelcomeMessageOrigin("https://kamooni.org/foo?bar=1#section"), "https://kamooni.org");
    assert.equal(getWelcomeMessageOrigin("https://staging.kamooni.org/anything"), "https://staging.kamooni.org");
    assert.equal(getWelcomeMessageOrigin("http://localhost:3000/path"), "http://localhost:3000");
    assert.equal(getWelcomeMessageOrigin("ftp://staging.kamooni.org"), "https://kamooni.org");
    assert.equal(getWelcomeMessageOrigin("not a URL"), "https://kamooni.org");
    assert.equal(getWelcomeMessageOrigin(""), "https://kamooni.org");
});
