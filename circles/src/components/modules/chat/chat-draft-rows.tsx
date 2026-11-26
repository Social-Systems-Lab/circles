"use client";

import { useEffect, useState } from "react";
import { FilePenLine } from "lucide-react";
import { createLatestAsyncRunner } from "@/lib/client/latest-async-runner";
import type { listDmDraftsAction } from "./draft-actions";

const DM_DRAFT_SAVED_EVENT = "kamooni:dm-draft-saved";

export function notifyDmDraftSaved() {
    window.dispatchEvent(new window.Event(DM_DRAFT_SAVED_EVENT));
}

export function ChatDraftRows({
    viewerDid,
    ready,
    composerPath,
    loadDrafts,
    onOpen,
}: {
    viewerDid: string;
    ready: boolean;
    composerPath: string | null;
    loadDrafts: typeof listDmDraftsAction;
    onOpen: (recipientDid: string) => void;
}) {
    const [drafts, setDrafts] = useState<Awaited<ReturnType<typeof listDmDraftsAction>>["drafts"]>([]);

    useEffect(() => {
        if (!ready) return;
        // Give the initial list priority in Next.js's shared Server Action queue.
        const runner = createLatestAsyncRunner({
            load: () => loadDrafts(viewerDid),
            apply: (result) => {
                if (result.success) setDrafts(result.drafts);
            },
            onError: (error) => console.error("Failed to load message drafts:", error),
        });
        const refresh = () => void runner.run();
        refresh();
        window.addEventListener(DM_DRAFT_SAVED_EVENT, refresh);
        return () => {
            runner.cancel();
            window.removeEventListener(DM_DRAFT_SAVED_EVENT, refresh);
        };
    }, [composerPath, loadDrafts, ready, viewerDid]);

    return drafts.map((draft) => (
        <button
            type="button"
            key={`draft-${draft.recipientDid}`}
            className="m-1 flex w-[calc(100%-0.5rem)] items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-100"
            onClick={() => onOpen(draft.recipientDid)}
        >
            <FilePenLine className="h-10 w-10 rounded-full bg-amber-50 p-2 text-amber-700" />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{draft.name}</span>
                <span className="block truncate text-xs text-amber-700">Draft · {draft.title}</span>
            </span>
        </button>
    ));
}
