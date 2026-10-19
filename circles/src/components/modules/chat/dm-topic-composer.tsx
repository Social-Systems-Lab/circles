"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    discardDmDraftAction,
    getDmComposerAction,
    saveDmDraftAction,
    submitDmFirstTopicAction,
} from "./draft-actions";

const newId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 24);

export function DmTopicComposer({
    recipientDid,
    profileCapability,
}: {
    recipientDid: string;
    profileCapability?: string;
}) {
    const router = useRouter();
    const generation = useRef(crypto.randomUUID());
    const revision = useRef(0);
    const submissionId = useRef(newId());
    const [recipientName, setRecipientName] = useState("recipient");
    const [title, setTitle] = useState("Hello");
    const [body, setBody] = useState("");
    const [hashtags, setHashtags] = useState("");
    const [status, setStatus] = useState<"loading" | "idle" | "saving" | "sending">("loading");
    const [error, setError] = useState("");

    useEffect(() => {
        void getDmComposerAction(recipientDid, profileCapability).then((result) => {
            if (!result.success || !result.recipient) {
                setError(result.message || "Recipient unavailable");
                setStatus("idle");
                return;
            }
            setRecipientName(result.recipient.name || "recipient");
            if (result.draft) {
                setTitle(result.draft.title);
                setBody(result.draft.body);
                setHashtags(result.draft.hashtags.join(", "));
                revision.current = result.draft.revision;
                generation.current = result.draft.generation;
            }
            setStatus("idle");
        });
    }, [profileCapability, recipientDid]);

    const save = useCallback(
        async (explicit = false) => {
            const nextRevision = ++revision.current;
            if (explicit) setStatus("saving");
            const result = await saveDmDraftAction({
                recipientDid,
                title,
                body,
                hashtags: hashtags
                    .split(",")
                    .map((tag) => tag.trim().replace(/^#/, ""))
                    .filter(Boolean),
                revision: nextRevision,
                generation: generation.current,
                profileCapability,
            });
            if (!result.success) setError(result.message || "Could not save draft");
            if (explicit) setStatus("idle");
        },
        [body, hashtags, profileCapability, recipientDid, title],
    );

    useEffect(() => {
        if (status === "loading") return;
        const timer = setTimeout(() => void save(false), 800);
        return () => clearTimeout(timer);
    }, [body, hashtags, save, status, title]);

    const submit = async () => {
        setStatus("sending");
        setError("");
        await save(false);
        const result = await submitDmFirstTopicAction({
            recipientDid,
            title,
            body,
            hashtags: hashtags
                .split(",")
                .map((tag) => tag.trim().replace(/^#/, ""))
                .filter(Boolean),
            generation: generation.current,
            submissionId: submissionId.current,
            profileCapability,
        });
        if (result.success) {
            router.replace(`/chat/${result.conversationId}${result.topicId ? `?topic=${result.topicId}` : ""}`);
            return;
        }
        setError(result.message || "Could not create topic");
        setStatus("idle");
    };

    const discard = async () => {
        await discardDmDraftAction(recipientDid, generation.current);
        router.push("/chat");
    };

    return (
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6">
            <h1 className="text-xl font-semibold">Message {recipientName}</h1>
            <Input aria-label="Topic title" value={title} onChange={(event) => setTitle(event.target.value)} />
            <Textarea
                aria-label="Message"
                rows={10}
                placeholder="Write your message…"
                value={body}
                onChange={(event) => setBody(event.target.value)}
            />
            <Input
                aria-label="Hashtags"
                placeholder="Hashtags, separated by commas"
                value={hashtags}
                onChange={(event) => setHashtags(event.target.value)}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={discard} disabled={status === "sending"}>
                    Discard
                </Button>
                <Button variant="outline" onClick={() => void save(true)} disabled={status !== "idle"}>
                    {status === "saving" ? "Saving…" : "Save Draft"}
                </Button>
                <Button onClick={submit} disabled={!title.trim() || status !== "idle"}>
                    {status === "sending" ? "Sending…" : "Create topic"}
                </Button>
            </div>
        </div>
    );
}
