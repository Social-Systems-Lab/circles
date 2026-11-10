import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import http from "node:http";
import { chromium } from "playwright";

const COOKIE_NAME = "__Host-kamooni-verified-registration";
const COOKIE_ATTRIBUTES = "Secure; HttpOnly; SameSite=Lax; Path=/";
let immediateContinueCookie = null;
let crossSitePostCookie = null;

const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/email") {
        response.setHeader("Content-Type", "text/html");
        response.end(`<a id="verify" href="http://localhost:${server.address().port}/verify">Verify email</a>`);
        return;
    }
    if (url.pathname === "/verify") {
        response.statusCode = 303;
        response.setHeader("Set-Cookie", `${COOKIE_NAME}=synthetic-capability; ${COOKIE_ATTRIBUTES}; Max-Age=1800`);
        response.setHeader("Location", `http://localhost:${server.address().port}/signup/continue`);
        response.end();
        return;
    }
    if (url.pathname === "/signup/continue") {
        immediateContinueCookie = request.headers.cookie || "";
        response.setHeader("Content-Type", "text/html");
        response.end('<form id="password-form"><input type="password" name="password"></form>');
        return;
    }
    if (url.pathname === "/cross-site-post-source") {
        response.setHeader("Content-Type", "text/html");
        response.end(
            `<form id="cross-site-post" method="post" action="http://localhost:${server.address().port}/password-completion"><button>Submit</button></form>`,
        );
        return;
    }
    if (url.pathname === "/password-completion" && request.method === "POST") {
        crossSitePostCookie = request.headers.cookie || "";
        response.end("blocked test request");
        return;
    }
    if (url.pathname === "/clear") {
        response.setHeader("Set-Cookie", `${COOKIE_NAME}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`);
        response.end("cleared");
        return;
    }
    response.statusCode = 404;
    response.end();
});

await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const configuredBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const executablePath = configuredBrowser || (existsSync(localChrome) ? localChrome : undefined);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });

try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const port = server.address().port;

    await page.goto(`http://127.0.0.1:${port}/email`);
    await Promise.all([page.waitForURL(/\/signup\/continue$/), page.click("#verify")]);
    assert.match(immediateContinueCookie || "", new RegExp(`${COOKIE_NAME}=synthetic-capability`));
    assert.equal(
        await page.locator("#password-form").count(),
        1,
        "password form must render on the first redirect GET",
    );

    const cookie = (await context.cookies()).find((candidate) => candidate.name === COOKIE_NAME);
    assert.ok(cookie, "verified continuation cookie must be stored");
    assert.equal(cookie.secure, true);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "Lax");
    assert.equal(cookie.path, "/");
    assert.ok(cookie.expires * 1000 - Date.now() > 29 * 60 * 1000, "cookie must remain short-lived");

    await page.goto(`http://127.0.0.1:${port}/cross-site-post-source`);
    await Promise.all([page.waitForURL(/\/password-completion$/), page.click("#cross-site-post button")]);
    assert.doesNotMatch(crossSitePostCookie || "", new RegExp(`${COOKIE_NAME}=`));

    await page.goto(`http://localhost:${port}/clear`);
    assert.equal(
        (await context.cookies()).some((candidate) => candidate.name === COOKIE_NAME),
        false,
        "browser-valid deletion attributes must remove the __Host- cookie",
    );

    console.log("verified continuation cross-site redirect browser checks passed");
} finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
}
