"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Circle } from "@/models/models";
import { CirclePicture } from "../circles/circle-picture";
import { findOrCreateDMRoomAction } from "./actions";
import { useToast } from "@/components/ui/use-toast";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { sendRoomMessage } from "@/lib/data/client-matrix";

interface DMModalProps {
    recipient: Circle;
    onClose: () => void;
}

export const DmChatModal: React.FC<DMModalProps> = ({ recipient, onClose }) => {
    const [user, setUser] = useAtom(userAtom);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const handleSendMessage = async () => {
        if (!user) return;
        if (!message.trim()) return;
        setLoading(true);

        try {
            // Get or create the DM room
            const result = await findOrCreateDMRoomAction(recipient);

            if (!result.success) {
                toast({
                    title: "Send Error",
                    description: "Failed to send chat message",
                    variant: "destructive",
                    icon: "error",
                });
                return;
            }

            // send the message
            await sendRoomMessage(user.matrixAccessToken!, user.matrixUrl!, result.chatRoom!.matrixRoomId!, message);

            // update user private data as it will have new chat membership data
            if (result.user) {
                setUser(result.user);
            }

            // Redirect to the chat
            router.push(`/chat/${recipient.handle}`);
        } catch (error) {
            console.error("Error sending DM:", error);
        } finally {
            setLoading(false);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-gray-900 bg-opacity-50">
            <div className="w-96 rounded-lg bg-white p-6 shadow-lg">
                <div className="flex flex-row items-center pb-2">
                    <CirclePicture circle={recipient} size="40px" />
                    <h2 className="m-0 ml-4 p-0 text-lg font-bold">Message {recipient.name}</h2>
                </div>
                <Textarea
                    className="mt-2 w-full rounded border p-2"
                    rows={4}
                    placeholder="Type your message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                />
                <div className="mt-4 flex justify-end space-x-2">
                    <Button variant="outline" className="rounded-full" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button className="rounded-full" disabled={loading} onClick={handleSendMessage}>
                        {loading ? "Sending..." : "Send"}
                    </Button>
                </div>
            </div>
        </div>
    );
};
