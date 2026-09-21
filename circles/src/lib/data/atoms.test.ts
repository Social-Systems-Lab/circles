import { beforeEach, describe, expect, test } from "bun:test";
import { createStore } from "jotai";
import type { UserSettings } from "@/models/models";
import * as atoms from "./atoms";

const readDefault = (atom: Parameters<ReturnType<typeof createStore>["get"]>[0]): unknown => createStore().get(atom);

beforeEach(() => {
    window.localStorage.clear();
});

describe("atom defaults", () => {
    test.each([
        ["userAtom", atoms.userAtom, undefined],
        ["triggerMapOpenAtom", atoms.triggerMapOpenAtom, false],
        ["mapOpenAtom", atoms.mapOpenAtom, false],
        ["mapboxKeyAtom", atoms.mapboxKeyAtom, ""],
        ["displayedContentAtom", atoms.displayedContentAtom, []],
        ["zoomContentAtom", atoms.zoomContentAtom, undefined],
        ["contentPreviewAtom", atoms.contentPreviewAtom, undefined],
        ["userToolboxDataAtom", atoms.userToolboxDataAtom, undefined],
        ["sidePanelContentVisibleAtom", atoms.sidePanelContentVisibleAtom, undefined],
        ["sidePanelModeAtom", atoms.sidePanelModeAtom, "none"],
        ["drawerContentAtom", atoms.drawerContentAtom, "explore"],
        ["focusPostAtom", atoms.focusPostAtom, undefined],
        ["imageGalleryAtom", atoms.imageGalleryAtom, null],
        ["unreadCountsAtom", atoms.unreadCountsAtom, {}],
        ["notificationUnreadCountAtom", atoms.notificationUnreadCountAtom, 0],
        ["latestMessagesAtom", atoms.latestMessagesAtom, {}],
        ["roomDataAtom", atoms.roomDataAtom, {}],
        ["roomMessagesAtom", atoms.roomMessagesAtom, {}],
        ["replyToMessageAtom", atoms.replyToMessageAtom, null],
        ["mapSearchCommandAtom", atoms.mapSearchCommandAtom, null],
        ["feedPanelDockedAtom", atoms.feedPanelDockedAtom, false],
    ])("%s starts as %p", (_name, atom, expected) => {
        expect(readDefault(atom as never)).toEqual(expected as never);
    });

    test("the auth info starts in the loading state", () => {
        expect(readDefault(atoms.authInfoAtom)).toEqual({ authStatus: "loading" });
    });

    test("the side panel search starts empty and idle", () => {
        expect(readDefault(atoms.sidePanelSearchStateAtom)).toEqual({
            query: "",
            isSearching: false,
            hasSearched: false,
            selectedCategory: null,
            selectedSdgHandles: [],
            selectedDateLabel: null,
            items: [],
        });
    });

    test("the create post dialog starts closed", () => {
        expect(readDefault(atoms.createPostDialogAtom)).toEqual({ isOpen: false });
    });

    test("the chat settings modal starts closed without a room", () => {
        expect(readDefault(atoms.chatSettingsModalAtom)).toEqual({ chatRoomId: null, isOpen: false });
    });

    test("user settings default to following tabs", () => {
        expect(readDefault(atoms.userSettingsAtom)).toEqual({ feedTab: "following", circlesTab: "following" });
    });
});

describe("atom behavior", () => {
    test("writable atoms hold what they are set to", () => {
        const store = createStore();

        store.set(atoms.mapOpenAtom, true);
        store.set(atoms.notificationUnreadCountAtom, 7);
        store.set(atoms.sidePanelModeAtom, "search");

        expect(store.get(atoms.mapOpenAtom)).toBe(true);
        expect(store.get(atoms.notificationUnreadCountAtom)).toBe(7);
        expect(store.get(atoms.sidePanelModeAtom)).toBe("search");
    });

    test("different stores do not share state", () => {
        const first = createStore();
        const second = createStore();

        first.set(atoms.mapOpenAtom, true);

        expect(second.get(atoms.mapOpenAtom)).toBe(false);
    });

    test("subscribers are notified of changes", () => {
        const store = createStore();
        const seen: number[] = [];
        store.sub(atoms.notificationUnreadCountAtom, () => seen.push(store.get(atoms.notificationUnreadCountAtom)));

        store.set(atoms.notificationUnreadCountAtom, 1);
        store.set(atoms.notificationUnreadCountAtom, 2);

        expect(seen).toEqual([1, 2]);
    });

    test("the default atoms hold independent initial objects per store", () => {
        const first = createStore();
        const second = createStore();

        expect(first.get(atoms.unreadCountsAtom)).toBe(second.get(atoms.unreadCountsAtom));
        first.set(atoms.unreadCountsAtom, { room: 3 });
        expect(second.get(atoms.unreadCountsAtom)).toEqual({});
    });
});

describe("userSettingsAtom persistence", () => {
    test("writes changes to localStorage under the userSettings key", () => {
        const store = createStore();

        const settings = { feedTab: "discover", circlesTab: "following" } as UserSettings;

        store.set(atoms.userSettingsAtom, settings);

        expect(JSON.parse(window.localStorage.getItem("userSettings")!)).toEqual(settings);
    });

    test("restores previously stored settings", async () => {
        window.localStorage.setItem("userSettings", JSON.stringify({ feedTab: "discover", circlesTab: "discover" }));
        const store = createStore();

        // atomWithStorage hydrates asynchronously on mount, so a subscription is needed to read the stored value.
        const unsubscribe = store.sub(atoms.userSettingsAtom, () => {});
        await Promise.resolve();

        expect(store.get(atoms.userSettingsAtom)).toEqual({ feedTab: "discover", circlesTab: "discover" });
        unsubscribe();
    });

    test("falls back to the default when the stored value is not valid JSON", () => {
        window.localStorage.setItem("userSettings", "{broken");

        expect(readDefault(atoms.userSettingsAtom)).toEqual({ feedTab: "following", circlesTab: "following" });
    });
});
