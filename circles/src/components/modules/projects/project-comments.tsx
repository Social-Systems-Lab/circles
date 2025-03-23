"use client";

import { Circle, CommentDisplay, Feed, Post, PostDisplay } from "@/models/models";
import { useState, useEffect, useTransition, useMemo } from "react";
import { createCommentAction, getAllCommentsAction } from "../feeds/actions";
import { PostItem } from "../feeds/post-list";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { isAuthorized } from "@/lib/auth/client-auth";
import { feedFeaturePrefix } from "@/lib/data/constants";
import { Loader2, MessageCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { createShadowPostForProjectAction } from "./project-actions";
import { FollowButton } from "../home/follow-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
    
    // Check if user is following the project
    const isFollowing = useMemo(() => {
        if (!user || !project._id) return false;
        return user.memberships?.some(m => m.circleId === project._id);
    }, [user, project._id]);
    
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
    
    // If no shadow post exists yet, show a simple message
    if (!localCommentPostId || !localPost) {
        if (embedded) {
            return (
                <div className="mt-2 flex items-center text-gray-500">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    <span className="text-sm">Comments available in full view</span>
                </div>
            );
        }
        
        return (
            <div className={embedded ? "mt-2" : "flex flex-col gap-4 rounded-lg bg-white p-4 shadow"}>
                {!embedded && <h2 className="text-xl font-semibold">Comments</h2>}
                <div className="py-2 text-center text-gray-500">
                    <p className="mb-2 text-sm">Loading comments...</p>
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
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
    
    // Check if user should be allowed to comment
    const canComment = isFollowing || project.createdBy === user?.did;
    
    return (
        <div className={embedded ? "" : "flex flex-col gap-4 rounded-lg bg-white p-4 shadow"}>
            {!embedded && <h2 className="text-xl font-semibold">Comments</h2>}
            
            {isPending ? (
                <div className="flex items-center justify-center py-4">
                    <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                    <span>Loading comments...</span>
                </div>
            ) : (
                <>
                    {!canComment && (
                        <Alert variant="warning" className="mb-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Follow to comment</AlertTitle>
                            <AlertDescription className="flex items-center justify-between">
                                <span>You need to follow this project to comment</span>
                                <FollowButton circle={project} />
                            </AlertDescription>
                        </Alert>
                    )}
                
                    <PostItem
                        post={postDisplay}
                        circle={circle}
                        feed={feed}
                        initialComments={localComments}
                        initialShowAllComments={true}
                        isAggregateFeed={false}
                        hideContent={true}
                        embedded={embedded}
                        disableComments={!canComment}
                    />
                </>
            )}
        </div>
    );
};