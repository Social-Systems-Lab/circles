"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Circle } from "@/models/models";
import { CirclePicture } from "../circles/circle-picture";
import { findOrCreateDMConversationAction, sendMongoMessageAction } from "./actions";
import { useToast } from "@/components/ui/use-toast";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";

interface DMModalProps {
    recipient: Circle;
    onClose: () => void;
    initialMessage?: string;
}

export const DmChatModal: React.FC<DMModalProps> = ({ recipient, onClose, initialMessage }) => {
    const [user] = useAtom(userAtom);
    const [message, setMessage] = useState(initialMessage || "");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const handleSendMessage = async () => {
        if (!user) return;
        if (!message.trim()) return;
        setLoading(true);

        try {
            const result = await findOrCreateDMConversationAction(recipient, { source: "profile" });
            const conversationId = result.chatRoom?._id || result.chatRoom?.handle;
            if (!result.success || !conversationId) {
                toast({
                    title: "Send Error",
                    description: result.message || "Failed to create direct message",
                    variant: "destructive",
                    icon: "error",
                });
                return;
            }

            const sendResult = await sendMongoMessageAction(conversationId, message);
            if (!sendResult.success) {
                toast({
                    title: "Send Error",
                    description: sendResult.message || "Failed to send direct message",
                    variant: "destructive",
                    icon: "error",
                });
                return;
            }

            router.push("/chat/" + conversationId);
            onClose();
        } catch (error) {
            console.error("Error sending DM:", error);
            toast({
                title: "Send Error",
                description: error instanceof Error ? error.message : "Failed to send direct message",
                variant: "destructive",
                icon: "error",
            });
        } finally {
            setLoading(false);
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
