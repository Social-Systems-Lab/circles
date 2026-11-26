"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useAtomValue, useStore } from "jotai";
import { usePathname } from "next/navigation";
import { authInfoAtom, userAtom } from "@/lib/data/atoms";
import { createChatRoomListRefresh, watchChatRoomList } from "@/lib/client/chat-room-list-refresh";
import type { ChatRoomDisplay } from "@/models/models";
import { listArchivedChatRoomsAction, listChatRoomsAction } from "./actions";

type RoomList = ReturnType<typeof createChatRoomListRefresh<ChatRoomDisplay>>;
const ChatRoomListsContext = createContext<{ active: RoomList; archived: RoomList } | null>(null);
// Retain only in-flight locks across a root remount in this tab, never the previous session's data.
const pendingLists = new Map<string, Promise<void>>();

function useOwnedRoomList(did?: string, archived = false) {
    const store = useStore();
    const list = useMemo(
        () =>
            createChatRoomListRefresh<ChatRoomDisplay>({
                key: `${archived ? "archived" : "active"}:${did}`,
                pendingLists,
                load: () => (archived ? listArchivedChatRoomsAction(did) : listChatRoomsAction(did)),
                canRefresh: () => document.visibilityState === "visible",
                onError: (error) => console.error("Failed to load conversations:", error),
                onSessionChanged: () => {
                    if (store.get(userAtom)?.did !== did) return;
                    store.set(userAtom, undefined);
                    store.set(authInfoAtom, { authStatus: "unauthenticated" });
                },
            }),
        [archived, did, store],
    );

    useEffect(() => {
        if (did) return watchChatRoomList(list);
    }, [did, list]);

    return list;
}

export function ChatRoomListProvider({ children }: { children: ReactNode }) {
    const did = useAtomValue(userAtom)?.did;
    const pathname = usePathname();
    const inArchive = pathname === "/chat/archived" || pathname.startsWith("/chat/archived/");
    const active = useOwnedRoomList(did);
    const archived = useOwnedRoomList(inArchive ? did : undefined, true);
    const value = useMemo(() => ({ active, archived }), [active, archived]);
    return <ChatRoomListsContext.Provider value={value}>{children}</ChatRoomListsContext.Provider>;
}

export function useChatRoomList(archived = false) {
    const lists = useContext(ChatRoomListsContext);
    if (!lists) throw new Error("ChatRoomListProvider is missing");
    const list = archived ? lists.archived : lists.active;
    const snapshot = useSyncExternalStore(list.subscribe, list.getSnapshot, list.getSnapshot);
    return { ...snapshot, refresh: list.refresh, beginUnreadUpdate: list.beginUnreadUpdate };
}
