"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createFeed, createPost, getPosts, addReaction, removeReaction } from "@/lib/data/feed";
import { useToast } from "@/components/ui/use-toast";
import { Feed, Post } from "@/models/models";

type FeedListProps = {
    feeds: Feed[];
    circleId: string;
    userDid: string;
    canCreateFeed: boolean;
    canCreatePost: boolean;
};

const FeedList = ({ feeds, circleId, userDid, canCreateFeed, canCreatePost }: FeedListProps) => {
    const [selectedFeed, setSelectedFeed] = useState<Feed | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [newPostContent, setNewPostContent] = useState("");
    const { toast } = useToast();

    const handleSelectFeed = async (feed: Feed) => {
        setSelectedFeed(feed);
        const fetchedPosts = await getPosts(feed._id.toString());
        setPosts(fetchedPosts);
    };

    const handleCreateFeed = async () => {
        if (!canCreateFeed) {
            toast({
                title: "Error",
                description: "You don't have permission to create a feed.",
                variant: "destructive",
            });
            return;
        }
        // Implement feed creation logic here
        toast({ title: "Success", description: "Feed created successfully." });
    };

    const handleCreatePost = async () => {
        if (!canCreatePost) {
            toast({
                title: "Error",
                description: "You don't have permission to create a post.",
                variant: "destructive",
            });
            return;
        }
        if (!selectedFeed) return;
        const newPost: Post = {
            feedId: selectedFeed._id.toString(),
            createdBy: userDid,
            createdAt: new Date(),
            content: newPostContent,
            reactions: {},
        };
        const createdPost = await createPost(newPost);
        setPosts([createdPost, ...posts]);
        setNewPostContent("");
        toast({ title: "Success", description: "Post created successfully." });
    };

    const handleReaction = async (post: Post, reactionType: string) => {
        const postId = post._id!.toString();
        if (post.reactions[reactionType]) {
            await removeReaction(postId, reactionType);
        } else {
            await addReaction(postId, reactionType);
        }
        const updatedPosts = posts.map((p) =>
            p._id === post._id
                ? { ...p, reactions: { ...p.reactions, [reactionType]: (p.reactions[reactionType] || 0) + 1 } }
                : p,
        );
        setPosts(updatedPosts);
    };

    return (
        <div className="space-y-4">
            <div className="flex space-x-2">
                {feeds.map((feed) => (
                    <Button
                        key={feed._id.toString()}
                        onClick={() => handleSelectFeed(feed)}
                        variant={selectedFeed?._id === feed._id ? "default" : "outline"}
                    >
                        {feed.name}
                    </Button>
                ))}
                {canCreateFeed && <Button onClick={handleCreateFeed}>Create Feed</Button>}
            </div>
            {selectedFeed && (
                <div>
                    <h2 className="mb-2 text-xl font-semibold">{selectedFeed.name}</h2>
                    {canCreatePost && (
                        <div className="mb-4">
                            <textarea
                                value={newPostContent}
                                onChange={(e) => setNewPostContent(e.target.value)}
                                className="w-full rounded border p-2"
                                placeholder="Write a new post..."
                            />
                            <Button onClick={handleCreatePost}>Create Post</Button>
                        </div>
                    )}
                    <ul className="space-y-4">
                        {posts.map((post) => (
                            <li key={post._id?.toString()} className="rounded bg-white p-4 shadow">
                                <p>{post.content}</p>
                                <div className="mt-2 flex space-x-2">
                                    <Button onClick={() => handleReaction(post, "like")} size="sm">
                                        👍 {post.reactions["like"] || 0}
                                    </Button>
                                    <Button onClick={() => handleReaction(post, "love")} size="sm">
                                        ❤️ {post.reactions["love"] || 0}
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default FeedList;
