import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { generateHandle, updateQueryParam } from "./helpers-client";

const happyDOM = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM;
const setLocation = (url: string) => happyDOM.setURL(`http://localhost${url}`);

describe("updateQueryParam", () => {
    const originalUrl = window.location.href;

    afterEach(() => {
        happyDOM.setURL(originalUrl);
    });

    const routerStub = () => {
        const pushed: string[] = [];
        return { pushed, router: { push: (url: string) => void pushed.push(url) } };
    };

    test("pushes a query string containing the new parameter", () => {
        setLocation("/circles/demo");
        const { router, pushed } = routerStub();

        updateQueryParam(router, "tab", "members");

        expect(pushed).toEqual(["?tab=members"]);
    });

    test("preserves other existing parameters", () => {
        setLocation("/circles/demo?sort=new&page=2");
        const { router, pushed } = routerStub();

        updateQueryParam(router, "tab", "members");

        expect(pushed).toEqual(["?sort=new&page=2&tab=members"]);
    });

    test("replaces the value of an existing parameter", () => {
        setLocation("/circles/demo?tab=feed&sort=new");
        const { router, pushed } = routerStub();

        updateQueryParam(router, "tab", "members");

        expect(pushed).toEqual(["?tab=members&sort=new"]);
    });

    test("collapses repeated occurrences of the parameter into one", () => {
        setLocation("/circles/demo?tab=a&tab=b");
        const { router, pushed } = routerStub();

        updateQueryParam(router, "tab", "c");

        expect(pushed).toEqual(["?tab=c"]);
    });

    test("url-encodes the value", () => {
        setLocation("/circles/demo");
        const { router, pushed } = routerStub();

        updateQueryParam(router, "q", "a b&c");

        expect(pushed).toEqual(["?q=a+b%26c"]);
    });

    test("allows setting an empty value", () => {
        setLocation("/circles/demo");
        const { router, pushed } = routerStub();

        updateQueryParam(router, "q", "");

        expect(pushed).toEqual(["?q="]);
    });
});

describe("generateHandle", () => {
    let random: ReturnType<typeof spyOn>;

    beforeEach(() => {
        // Math.random().toString(36) => "0.i" followed by base36 digits; "0.4fzyo82mvyr" gives "4fzyo8"
        random = spyOn(Math, "random").mockReturnValue(0.5);
    });

    afterEach(() => {
        random.mockRestore();
    });

    const suffix = () => (0.5).toString(36).substring(2, 8);

    test("appends a random suffix to the normalized title", () => {
        expect(suffix()).toBe("i");
        expect(generateHandle("Hi")).toBe("hi-i");
    });

    test("lowercases, strips special characters and hyphenates spaces", () => {
        expect(generateHandle("My Circle!")).toBe("my-circle-i");
    });

    test("collapses runs of whitespace and hyphens", () => {
        expect(generateHandle("a   b---c")).toBe("a-b-c-i");
    });

    test("truncates handles longer than 20 characters to 12 title characters plus the suffix", () => {
        random.mockReturnValue(0.123456789);
        const randomStr = (0.123456789).toString(36).substring(2, 8);
        const handle = generateHandle("A very long circle title indeed");

        // The 12 character title prefix "a-very-long-" already ends in a hyphen, so the separator that
        // is added before the suffix yields a double hyphen.
        expect(handle).toBe(`a-very-long--${randomStr}`);
        expect(handle).toHaveLength(19);
    });

    test("does not truncate a handle that is exactly 20 characters", () => {
        random.mockReturnValue(0.5); // suffix "i"
        // "-i" adds 2 characters, so an 18 character title reaches the 20 character limit
        const title = "abcdefghijklmnopqr";
        expect(generateHandle(title)).toBe(`${title}-i`);
        expect(generateHandle(title)).toHaveLength(20);
    });

    test("produces only a suffix when the title has no word characters", () => {
        expect(generateHandle("!!!")).toBe("-i");
    });

    test("produces different handles for different random values", () => {
        random.mockReturnValueOnce(0.111111).mockReturnValueOnce(0.777777);
        expect(generateHandle("same")).not.toBe(generateHandle("same"));
    });
});
