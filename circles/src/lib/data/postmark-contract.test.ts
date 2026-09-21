import { describe, expect, test } from "bun:test";
import { ServerClient, TemplatedMessage } from "postmark";

// email.ts is tested with `postmark` replaced by mock.module, so nothing there would notice if the
// real package changed shape. This file pins the surface email.ts actually depends on. Nothing here
// touches the network: constructing a ServerClient does not call the API.

describe("ServerClient", () => {
    const client = new ServerClient("pm-token");

    test("is constructible from a server token", () => {
        expect(client).toBeInstanceOf(ServerClient);
    });

    test("sends templated mail through sendEmailWithTemplate", () => {
        expect(typeof client.sendEmailWithTemplate).toBe("function");
    });
});

describe("TemplatedMessage", () => {
    // The positional signature used at email.ts:97.
    const message = new TemplatedMessage("sender@kamooni.example", "welcome", { name: "Ada" }, "to@example.com");

    test.each([
        ["From", "sender@kamooni.example"],
        ["TemplateAlias", "welcome"],
        ["To", "to@example.com"],
    ])("keeps %p from the positional constructor", (field, expected) => {
        expect((message as unknown as Record<string, unknown>)[field]).toBe(expected);
    });

    test("keeps the template model", () => {
        expect(message.TemplateModel).toEqual({ name: "Ada" });
    });
});
