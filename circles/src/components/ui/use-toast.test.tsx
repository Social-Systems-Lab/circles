import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { reducer, toast, useToast } from "./use-toast";

type ToastState = Parameters<typeof reducer>[0];
type ToasterToast = ToastState["toasts"][number];

const aToast = (overrides: Partial<ToasterToast> = {}): ToasterToast =>
    ({ id: "1", title: "Saved", open: true, ...overrides }) as ToasterToast;

describe("toast reducer", () => {
    test("ADD_TOAST puts the newest toast first", () => {
        const state = reducer({ toasts: [] }, { type: "ADD_TOAST", toast: aToast({ id: "1" }) });

        expect(state.toasts.map((t) => t.id)).toEqual(["1"]);
    });

    test("ADD_TOAST keeps only the most recent toast because the limit is one", () => {
        const withFirst = reducer({ toasts: [] }, { type: "ADD_TOAST", toast: aToast({ id: "1" }) });
        const withSecond = reducer(withFirst, { type: "ADD_TOAST", toast: aToast({ id: "2" }) });

        expect(withSecond.toasts.map((t) => t.id)).toEqual(["2"]);
    });

    test("UPDATE_TOAST merges fields into the matching toast only", () => {
        const initial: ToastState = { toasts: [aToast({ id: "1", title: "Before" })] };

        const updated = reducer(initial, { type: "UPDATE_TOAST", toast: { id: "1", title: "After" } });

        expect(updated.toasts[0].title).toBe("After");
        expect(updated.toasts[0].open).toBe(true);
    });

    test("UPDATE_TOAST leaves state untouched when no toast matches the id", () => {
        const initial: ToastState = { toasts: [aToast({ id: "1", title: "Before" })] };

        const updated = reducer(initial, { type: "UPDATE_TOAST", toast: { id: "missing", title: "After" } });

        expect(updated.toasts[0].title).toBe("Before");
    });

    test("DISMISS_TOAST closes the given toast but keeps it in the list", () => {
        const initial: ToastState = { toasts: [aToast({ id: "1" })] };

        const dismissed = reducer(initial, { type: "DISMISS_TOAST", toastId: "1" });

        expect(dismissed.toasts).toHaveLength(1);
        expect(dismissed.toasts[0].open).toBe(false);
    });

    test("DISMISS_TOAST without an id closes every toast", () => {
        const initial: ToastState = { toasts: [aToast({ id: "1" }), aToast({ id: "2" })] };

        const dismissed = reducer(initial, { type: "DISMISS_TOAST", toastId: undefined });

        expect(dismissed.toasts.every((t) => t.open === false)).toBe(true);
    });

    test("REMOVE_TOAST drops only the matching toast", () => {
        const initial: ToastState = { toasts: [aToast({ id: "1" }), aToast({ id: "2" })] };

        const removed = reducer(initial, { type: "REMOVE_TOAST", toastId: "1" });

        expect(removed.toasts.map((t) => t.id)).toEqual(["2"]);
    });

    test("REMOVE_TOAST without an id clears the list", () => {
        const initial: ToastState = { toasts: [aToast({ id: "1" }), aToast({ id: "2" })] };

        const removed = reducer(initial, { type: "REMOVE_TOAST", toastId: undefined });

        expect(removed.toasts).toEqual([]);
    });

    test("does not mutate the state it is given", () => {
        const initial: ToastState = { toasts: [aToast({ id: "1" })] };

        reducer(initial, { type: "DISMISS_TOAST", toastId: "1" });

        expect(initial.toasts[0].open).toBe(true);
    });
});

describe("useToast", () => {
    test("exposes a toast created through the returned helper", () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.toast({ title: "Profile saved" });
        });

        expect(result.current.toasts[0]).toMatchObject({ title: "Profile saved", open: true });
    });

    test("gives each toast a distinct id", () => {
        const { result } = renderHook(() => useToast());
        const ids: string[] = [];

        act(() => {
            ids.push(result.current.toast({ title: "One" }).id);
            ids.push(result.current.toast({ title: "Two" }).id);
        });

        expect(ids[0]).not.toBe(ids[1]);
    });

    test("updates an existing toast through the returned update handle", () => {
        const { result } = renderHook(() => useToast());
        let handle: ReturnType<typeof toast>;

        act(() => {
            handle = result.current.toast({ title: "Uploading" });
        });
        act(() => {
            handle.update({ id: handle.id, title: "Uploaded" } as Parameters<typeof handle.update>[0]);
        });

        expect(result.current.toasts[0].title).toBe("Uploaded");
    });

    test("closes a toast through the returned dismiss handle", () => {
        const { result } = renderHook(() => useToast());
        let handle: ReturnType<typeof toast>;

        act(() => {
            handle = result.current.toast({ title: "Dismiss me" });
        });
        act(() => {
            handle.dismiss();
        });

        expect(result.current.toasts[0].open).toBe(false);
    });

    test("closes the toast when its onOpenChange reports a close", () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.toast({ title: "Auto close" });
        });
        act(() => {
            result.current.toasts[0].onOpenChange?.(false);
        });

        expect(result.current.toasts[0].open).toBe(false);
    });

    test("keeps the toast open when onOpenChange reports an open", () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.toast({ title: "Stay open" });
        });
        act(() => {
            result.current.toasts[0].onOpenChange?.(true);
        });

        expect(result.current.toasts[0].open).toBe(true);
    });

    test("shares one toast store across separate hook consumers", () => {
        const first = renderHook(() => useToast());
        const second = renderHook(() => useToast());

        act(() => {
            first.result.current.toast({ title: "Shared toast" });
        });

        expect(second.result.current.toasts[0].title).toBe("Shared toast");
    });

    test("stops receiving updates once unmounted", () => {
        const { result, unmount } = renderHook(() => useToast());
        const other = renderHook(() => useToast());

        act(() => {
            result.current.toast({ title: "Before unmount" });
        });
        const snapshot = result.current.toasts[0].title;
        unmount();

        act(() => {
            other.result.current.toast({ title: "After unmount" });
        });

        expect(result.current.toasts[0].title).toBe(snapshot);
        expect(other.result.current.toasts[0].title).toBe("After unmount");
    });

    test("dismiss() without an id closes the visible toast", () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.toast({ title: "Close all" });
        });
        act(() => {
            result.current.dismiss();
        });

        expect(result.current.toasts.every((t) => t.open === false)).toBe(true);
    });
});
