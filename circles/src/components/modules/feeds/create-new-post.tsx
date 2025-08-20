// create-new-post.tsx
import { useAtom } from "jotai";
import { userAtom, createPostDialogAtom } from "@/lib/data/atoms"; // Import createPostDialogAtom
import { UserPicture } from "../members/user-picture";
import { Circle, Feed } from "@/models/models";
import { useIsCompact } from "@/components/utils/use-is-compact";

type CreateNewPostProps = {
    circle: Circle; // This will be the circle context for the post
    feed: Feed; // This will be the feed context for the post
};

export function CreateNewPost({ circle, feed }: CreateNewPostProps) {
    const [user] = useAtom(userAtom);
    const [, setCreatePostDialogState] = useAtom(createPostDialogAtom); // Use the new atom
    const isCompact = useIsCompact();

    const handleOpenDialog = () => {
        if (user) {
            setCreatePostDialogState({
                isOpen: true,
                circle: circle, // Pass the circle prop
                feed: feed, // Pass the feed prop
            });
        }
    };

    return (
        // The Dialog and DialogContent are removed. We only render the trigger.
        <div
            className={`mb-2 flex flex-1 cursor-pointer items-center space-x-4  ${
                isCompact ? "" : "rounded-[15px] border-0 shadow-lg"
            }  bg-white p-4`}
            onClick={handleOpenDialog} // Open dialog by setting atom state
        >
            <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
            <div className="flex-grow">
                <input
                    disabled={!user}
                    type="text"
                    placeholder={user ? "Create announcement" : "Log in to create an announcement"}
                    className="pointer-events-none w-full rounded-full bg-gray-100 p-2 pl-4 focus:outline-none focus:ring-2 focus:ring-blue-500" // Added pointer-events-none as click is on parent
                    readOnly
                />
            </div>
        </div>
    );
}
