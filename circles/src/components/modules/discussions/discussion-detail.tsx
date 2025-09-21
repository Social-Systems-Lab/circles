"use client";

import { useEffect, useState } from "react";
import { getDiscussionAction, addCommentAction } from "@/app/circles/[handle]/discussions/actions";
import { Post, Comment, Circle, Feed } from "@/models/models";
import DiscussionItem from "./discussion-item";

interface DiscussionDetailProps {
    discussionId: string;
}

export default function DiscussionDetail({ discussionId }: DiscussionDetailProps) {
    const [discussion, setDiscussion] = useState<(Post & { circle?: Circle; feed?: Feed }) | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [newComment, setNewComment] = useState("");

    useEffect(() => {
        async function fetchDiscussion() {
            try {
                const result = await getDiscussionAction(discussionId);
                if (result) {
                    setDiscussion(result as Post);
                    // @ts-ignore: comments may be populated
                    setComments(result.comments || []);
                }
            } catch (err) {
                console.error("Failed to load discussion", err);
            } finally {
                setLoading(false);
            }
        }
        fetchDiscussion();
    }, [discussionId]);

    async function handleAddComment() {
        if (!newComment.trim()) return;
        try {
            await addCommentAction(discussionId, { content: newComment });
            const refreshed = await getDiscussionAction(discussionId);
            if (refreshed && (refreshed as any).comments) {
                // @ts-ignore
                setComments((refreshed as any).comments);
            }
            setNewComment("");
        } catch (err) {
            console.error("Failed to add comment", err);
        }
    }

    if (loading) return <div>Loading discussion...</div>;
    if (!discussion) return <div>Discussion not found.</div>;

    return (
        <div className="space-y-4">
            <DiscussionItem
                discussion={discussion as any}
                circle={discussion.circle as Circle}
                feed={discussion.feed as Feed}
                initialComments={comments as any}
                initialShowAllComments={true}
            />
        </div>
    );
}
