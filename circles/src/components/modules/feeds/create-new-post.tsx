// create-new-post.tsx
import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { UserPicture } from "../members/user-picture";
import { Circle, Feed, UserPrivate } from "@/models/models";
import { createPostAction } from "./actions";
import { useToast } from "@/components/ui/use-toast";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { PostForm } from "./post-form";
import { DialogTitle } from "@radix-ui/react-dialog";

type CreateNewPostProps = {
    circle: Circle;
    feed: Feed;
};

export function CreateNewPost({ circle, feed }: CreateNewPostProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [user] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const isCompact = useIsCompact();

    const handleSubmit = async (formData: FormData) => {
        startTransition(async () => {
            const response = await createPostAction(formData);

            if (!response.success) {
                toast({
                    title: response.message,
                    variant: "destructive",
                });
                return;
            } else {
                toast({
                    title: "Post created successfully",
                    variant: "success",
                });
            }

            setIsOpen(false);
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <div
                    className={`mb-2 flex flex-1 cursor-pointer items-center space-x-4  ${
                        isCompact ? "" : "rounded-[15px] border-0 shadow-lg"
                    }  bg-white p-4`}
                >
                    <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
                    <div className="flex-grow">
                        <input
                            disabled={!user}
                            type="text"
                            placeholder={user ? "Share your story" : "Log in to post"}
                            className="w-full rounded-full bg-gray-100 p-2 pl-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={() => {
                                if (user) {
                                    setIsOpen(true);
                                }
                            }}
                            readOnly
                        />
                    </div>
                </div>
            </DialogTrigger>

            <DialogContent
                className="z-[110] rounded-[15px] bg-white p-0 sm:max-w-[425px] sm:rounded-[15px]" // Added z-[110]
                onInteractOutside={(e) => {
                    e.preventDefault();
                }}
            >
                <div className="hidden">
                    <DialogTitle>Create a new post</DialogTitle>
                </div>
                {user && (
                    <PostForm
                        user={user as UserPrivate}
                        onSubmit={handleSubmit}
                        onCancel={() => setIsOpen(false)}
                        itemKey="post"
                        moduleHandle="feed"
                        createFeatureHandle="post"
                        initialSelectedCircleId={circle._id} // Pass the current circle's ID
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
