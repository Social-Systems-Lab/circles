"use client";

import { Circle, CommentDisplay, Feed, Post, PostDisplay } from "@/models/models";
import { useState, useEffect, useTransition } from "react";
import { createCommentAction, getAllCommentsAction } from "../feeds/actions";
import { PostItem } from "../feeds/post-list";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { isAuthorized } from "@/lib/auth/client-auth";
import { feedFeaturePrefix } from "@/lib/data/constants";
import { Loader2, MessageCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { createShadowPostForProjectAction } from "./project-actions";

type ProjectCommentsSectionProps = {
    project: Circle;
    circle: Circle;
    feed: Feed;
    initialComments?: CommentDisplay[];
    commentPostId?: string;
    post?: Post | null;
    embedded?: boolean;
};

export const ProjectCommentsSection = ({ 
    project, 
    circle, 
    feed, 
    initialComments = [],
    commentPostId,
    post,
    embedded = false
}: ProjectCommentsSectionProps) => {
    const [isPending, startTransition] = useTransition();
    const [isCreatingShadowPost, setIsCreatingShadowPost] = useState(false);
    const [localPost, setLocalPost] = useState(post);
    const [localCommentPostId, setLocalCommentPostId] = useState(commentPostId);
    const [localComments, setLocalComments] = useState(initialComments);
    const [user] = useAtom(userAtom);
    const { toast } = useToast();
    
    const createShadowPost = async () => {
        if (!project._id || !feed) return;
        
        setIsCreatingShadowPost(true);
        try {
            const result = await createShadowPostForProjectAction(project._id, feed._id);
            
            if (result.success && result.data) {
                setLocalPost(result.data.post);
                setLocalCommentPostId(result.data.post._id);
                setLocalComments([]);
                
                toast({
                    title: "Success",
                    description: "Comments are now enabled for this project",
                    variant: "success",
                });
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to enable comments for this project",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error creating shadow post:", error);
            toast({
                title: "Error",
                description: "Failed to enable comments for this project",
                variant: "destructive",
            });
        } finally {
            setIsCreatingShadowPost(false);
        }
    };
    
    // If no shadow post exists yet, show message or minimal interface for embedded mode
    if (!localCommentPostId || !localPost) {
        if (embedded) {
            return (
                <div className="mt-2 flex items-center text-gray-500">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    <span className="text-sm">Comments not available</span>
                    
                    {isAuthorized(user, circle, "admin") && (
                        <Button 
                            onClick={createShadowPost} 
                            disabled={isCreatingShadowPost}
                            variant="ghost"
                            size="sm"
                            className="ml-2"
                        >
                            {isCreatingShadowPost ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                "Enable"
                            )}
                        </Button>
                    )}
                </div>
            );
        }
        
        return (
            <div className={embedded ? "mt-2" : "flex flex-col gap-4 rounded-lg bg-white p-4 shadow"}>
                {!embedded && <h2 className="text-xl font-semibold">Comments</h2>}
                <div className="py-2 text-center text-gray-500">
                    <p className="mb-2 text-sm">Comments are not available for this project yet.</p>
                    
                    {isAuthorized(user, circle, "admin") && (
                        <Button 
                            onClick={createShadowPost} 
                            disabled={isCreatingShadowPost}
                            variant="outline"
                            size="sm"
                        >
                            {isCreatingShadowPost ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Enabling comments...
                                </>
                            ) : (
                                "Enable Comments for This Project"
                            )}
                        </Button>
                    )}
                </div>
            </div>
        );
    }
    
    // Create a PostDisplay from the shadow post
    const postDisplay: PostDisplay = {
        ...localPost,
        _id: localCommentPostId,
        author: circle,
        comments: localComments.length,
        mentionsDisplay: []
    };
    
    return (
        <div className={embedded ? "" : "flex flex-col gap-4 rounded-lg bg-white p-4 shadow"}>
            {!embedded && <h2 className="text-xl font-semibold">Comments</h2>}
            
            {isPending ? (
                <div className="flex items-center justify-center py-4">
                    <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                    <span>Loading comments...</span>
                </div>
            ) : (
                <PostItem
                    post={postDisplay}
                    circle={circle}
                    feed={feed}
                    initialComments={localComments}
                    initialShowAllComments={true}
                    isAggregateFeed={false}
                    hideContent={true}
                    embedded={embedded}
                />
            )}
        </div>
    );
};