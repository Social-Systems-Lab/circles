"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, MapPinIcon, BarChartIcon, X } from "lucide-react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { UserPicture } from "./modules/members/user-picture";
import { Circle } from "@/models/models";
import { CirclePicture } from "./modules/circles/circle-picture";

type CreateNewPostProps = {
    circle: Circle;
};

export function CreateNewPost({ circle }: CreateNewPostProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [postContent, setPostContent] = useState("");
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [user] = useAtom(userAtom);

    const handlePost = () => {
        console.log("Posting:", postContent);
        setPostContent("");
        setIsOpen(false);
        setShowLocationPicker(false);
        setShowPollCreator(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <div className="flex cursor-pointer items-center space-x-4 rounded-lg bg-white p-4 shadow">
                    <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
                    <div className="flex-grow">
                        <input
                            disabled={!user}
                            type="text"
                            placeholder={user ? "Share your story" : "Log in to post"}
                            className="w-full rounded-full bg-gray-100 p-2 pl-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={() => {
                                if (user) setIsOpen(true);
                            }}
                            readOnly
                        />
                    </div>
                </div>
            </DialogTrigger>
            <DialogContent className="overflow-hidden rounded-[15px] p-0 sm:max-w-[425px] sm:rounded-[15px]">
                <div className="bg-white shadow-lg">
                    <div className="flex items-center justify-between p-4">
                        <div className="flex items-center space-x-2">
                            <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
                            <div>
                                <div className="text-sm font-semibold">{user?.name}</div>
                                <div className="flex flex-row items-center justify-center gap-[4px]">
                                    <div className="text-xs text-gray-500">Post in</div>
                                    <CirclePicture name={circle?.name} picture={circle?.picture?.url} size="14px" />
                                    <div className="text-xs text-gray-500">{circle?.name}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4">
                        <Textarea
                            placeholder="Share your story"
                            value={postContent}
                            onChange={(e) => setPostContent(e.target.value)}
                            className="min-h-[150px] w-full resize-none border-0 text-lg focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0"
                        />
                        {showLocationPicker && (
                            <div className="mt-4 rounded-lg bg-gray-100 p-4">
                                <p className="text-sm text-gray-600">📍 Location picker placeholder</p>
                            </div>
                        )}
                        {showPollCreator && (
                            <div className="mt-4 rounded-lg bg-gray-100 p-4">
                                <p className="text-sm text-gray-600">📊 Poll creator placeholder</p>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center justify-between p-4">
                        <div className="flex space-x-2">
                            <Button variant="ghost" size="icon" className="rounded-full">
                                <ImageIcon className="h-5 w-5 text-gray-500" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full"
                                onClick={() => setShowLocationPicker(!showLocationPicker)}
                            >
                                <MapPinIcon className="h-5 w-5 text-gray-500" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full"
                                onClick={() => setShowPollCreator(!showPollCreator)}
                            >
                                <BarChartIcon className="h-5 w-5 text-gray-500" />
                            </Button>
                        </div>
                        <div className="space-x-2">
                            <Button variant="ghost" className="text-gray-500" onClick={() => setIsOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                className="rounded-full bg-blue-500 px-6 text-white hover:bg-blue-600"
                                onClick={handlePost}
                            >
                                Post
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// import { useState } from "react";
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// import { Button } from "@/components/ui/button";
// import { Textarea } from "@/components/ui/textarea";
// import { ImageIcon, VideoIcon, SmileIcon, MapPinIcon, X } from "lucide-react";

// export function CreateNewPost() {
//     const [isOpen, setIsOpen] = useState(false);
//     const [postContent, setPostContent] = useState("");
//     const [showLocationPicker, setShowLocationPicker] = useState(false);
//     const [attachments, setAttachments] = useState<{ type: "image" | "video"; url: string }[]>([]);

//     const handlePost = () => {
//         console.log("Posting:", { content: postContent, attachments });
//         setPostContent("");
//         setAttachments([]);
//         setIsOpen(false);
//         setShowLocationPicker(false);
//     };

//     const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, type: "image" | "video") => {
//         const file = event.target.files?.[0];
//         if (file) {
//             const url = URL.createObjectURL(file);
//             setAttachments((prev) => [...prev, { type, url }]);
//         }
//     };

//     const removeAttachment = (index: number) => {
//         setAttachments((prev) => prev.filter((_, i) => i !== index));
//     };

//     return (
//         <Dialog open={isOpen} onOpenChange={setIsOpen}>
//             <DialogTrigger asChild>
//                 <div className="flex cursor-pointer items-center space-x-4 rounded-lg bg-white p-4 shadow">
//                     <Avatar>
//                         <AvatarImage src="/placeholder-avatar.jpg" alt="@username" />
//                         <AvatarFallback>UN</AvatarFallback>
//                     </Avatar>
//                     <div className="flex-grow">
//                         <input
//                             type="text"
//                             placeholder="Share your story"
//                             className="w-full rounded-full bg-gray-100 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
//                             onClick={() => setIsOpen(true)}
//                             readOnly
//                         />
//                     </div>
//                 </div>
//             </DialogTrigger>
//             <DialogContent className="sm:max-w-[425px]">
//                 <DialogHeader>
//                     <DialogTitle>Share your story</DialogTitle>
//                     {/* <Button
//             variant="ghost"
//             size="icon"
//             className="absolute right-4 top-4"
//             onClick={() => setIsOpen(false)}
//           >
//             <X className="h-4 w-4" />
//           </Button> */}
//                 </DialogHeader>
//                 <div className="grid gap-4 py-4">
//                     <div className="flex items-start space-x-4">
//                         <Avatar>
//                             <AvatarImage src="/placeholder-avatar.jpg" alt="@username" />
//                             <AvatarFallback>UN</AvatarFallback>
//                         </Avatar>
//                         <Textarea
//                             placeholder="What's on your mind?"
//                             value={postContent}
//                             onChange={(e) => setPostContent(e.target.value)}
//                             className="flex-grow"
//                         />
//                     </div>
//                     {attachments.length > 0 && (
//                         <div className="grid grid-cols-2 gap-2">
//                             {attachments.map((attachment, index) => (
//                                 <div key={index} className="relative">
//                                     {attachment.type === "image" ? (
//                                         <img
//                                             src={attachment.url}
//                                             alt="Attachment"
//                                             className="h-32 w-full rounded object-cover"
//                                         />
//                                     ) : (
//                                         <video src={attachment.url} className="h-32 w-full rounded object-cover" />
//                                     )}
//                                     <Button
//                                         variant="destructive"
//                                         size="icon"
//                                         className="absolute right-1 top-1"
//                                         onClick={() => removeAttachment(index)}
//                                     >
//                                         <X className="h-4 w-4" />
//                                     </Button>
//                                 </div>
//                             ))}
//                         </div>
//                     )}
//                     {showLocationPicker && <div className="rounded bg-gray-100 p-4">Location picker placeholder</div>}
//                     <div className="flex items-center justify-between">
//                         <div className="flex space-x-2">
//                             <Button
//                                 variant="outline"
//                                 size="icon"
//                                 onClick={() => document.getElementById("image-upload")?.click()}
//                             >
//                                 <ImageIcon className="h-4 w-4" />
//                             </Button>
//                             <input
//                                 id="image-upload"
//                                 type="file"
//                                 accept="image/*"
//                                 className="hidden"
//                                 onChange={(e) => handleFileUpload(e, "image")}
//                             />
//                             <Button
//                                 variant="outline"
//                                 size="icon"
//                                 onClick={() => document.getElementById("video-upload")?.click()}
//                             >
//                                 <VideoIcon className="h-4 w-4" />
//                             </Button>
//                             <input
//                                 id="video-upload"
//                                 type="file"
//                                 accept="video/*"
//                                 className="hidden"
//                                 onChange={(e) => handleFileUpload(e, "video")}
//                             />
//                             <Button variant="outline" size="icon">
//                                 <SmileIcon className="h-4 w-4" />
//                             </Button>
//                             <Button
//                                 variant="outline"
//                                 size="icon"
//                                 onClick={() => setShowLocationPicker(!showLocationPicker)}
//                             >
//                                 <MapPinIcon className="h-4 w-4" />
//                             </Button>
//                         </div>
//                         <div className="space-x-2">
//                             <Button variant="outline" onClick={() => setIsOpen(false)}>
//                                 Cancel
//                             </Button>
//                             <Button onClick={handlePost}>Post</Button>
//                         </div>
//                     </div>
//                 </div>
//             </DialogContent>
//         </Dialog>
//     );
// }
