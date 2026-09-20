import { describe, expect, test } from "bun:test";
import { useEffect, useState } from "react";
import { render, screen } from "@testing-library/react";
import { focusElement, settleFloatingUi, waitForUi } from "@/test/react-act";

function ThrowsAfterMicrotask() {
    const [explode, setExplode] = useState(false);

    useEffect(() => {
        queueMicrotask(() => setExplode(true));
    }, []);

    if (explode) {
        throw new Error("deferred render boom");
    }

    return <button type="button">safe</button>;
}

function ThrowsOnFocus() {
    const [explode, setExplode] = useState(false);

    if (explode) {
        throw new Error("focus render boom");
    }

    return (
        <button type="button" onFocus={() => setExplode(true)}>
            focus me
        </button>
    );
}

describe("react-act helpers", () => {
    test("settleFloatingUi rethrows errors from deferred updates it flushes", async () => {
        // React still reports the render error to the console; we only care that
        // the helper does not absorb it into a passing await.
        const consoleError = console.error;
        console.error = () => {};

        try {
            render(<ThrowsAfterMicrotask />);
            await expect(settleFloatingUi()).rejects.toThrow("deferred render boom");
        } finally {
            console.error = consoleError;
        }
    });

    test("focusElement rethrows errors from updates triggered by focus", async () => {
        const consoleError = console.error;
        console.error = () => {};

        try {
            render(<ThrowsOnFocus />);
            await expect(focusElement(screen.getByRole("button"))).rejects.toThrow("focus render boom");
        } finally {
            console.error = consoleError;
        }
    });

    test("waitForUi does not run settlement when the assertion fails", async () => {
        render(<button type="button">safe</button>);

        await expect(waitForUi(() => expect(screen.getByText("missing")).toBeInTheDocument(), { timeout: 50 })).rejects.toThrow();
        expect(screen.getByRole("button")).toHaveTextContent("safe");
    });
});
