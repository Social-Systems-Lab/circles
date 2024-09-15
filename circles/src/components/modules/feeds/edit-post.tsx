import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Circle, Feed, Page, PostDisplay } from "@/models/models";
import { updatePostAction } from "./actions";
import { useToast } from "@/components/ui/use-toast";
import { PostForm } from "./post-form";

type EditPostProps = {
    circle: Circle;
    feed: Feed;
    post: PostDisplay;
    page: Page;
    subpage?: string;
    isOpen: boolean;
    onClose: () => void;
};

export function EditPost({ circle, feed, post, page, subpage, isOpen, onClose }: EditPostProps) {
    const [user] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handleSubmit = async (formData: FormData) => {
        startTransition(async () => {
            const response = await updatePostAction(formData, page, subpage);

            if (!response.success) {
                toast({
                    title: response.message,
                    variant: "destructive",
                });
                return;
            } else {
                toast({
                    title: "Post updated successfully",
                    variant: "success",
                });
            }

            onClose();
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogTrigger asChild></DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <PostForm
                    circle={circle}
                    feed={feed}
                    user={user}
                    initialPost={post}
                    onSubmit={handleSubmit}
                    onCancel={onClose}
                />
            </DialogContent>
        </Dialog>
    );
}
