"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { userAtom } from "@/lib/data/atoms";
import { Circle } from "@/models/models";
import { useAtom } from "jotai";
import {
    acceptConnectRequestAction,
    declineConnectRequestAction,
    getProfileRelationshipStateAction,
    sendConnectRequestAction,
} from "./actions";
import { useToast } from "@/components/ui/use-toast";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { ChevronDown, Loader2 } from "lucide-react";
import { TbMessage } from "react-icons/tb";
import { useRouter } from "next/navigation";
import { findOrCreateDMConversationAction } from "../chat/actions";

type MessageButtonProps = {
    circle: Circle;
    renderCompact?: boolean;
};

type RelationshipState = {
    dmAllowed: boolean;
    showConnect: boolean;
    connectLabel: "Connect" | "Add Contact" | "Requested" | "Requested You" | null;
    messageVisibilityReason:
        | "self"
        | "existing_dm_history"
        | "dm_permission_contact"
        | "dm_permission_legacy_dm"
        | "dm_permission_recipient_setting"
        | "dm_not_allowed";
    connectLabelReason:
        | "message_available"
        | "pending_sent"
        | "pending_received"
        | "contact_not_established"
        | "contact_established";
};

export const MessageButton = ({ circle, renderCompact }: MessageButtonProps) => {
    const [user] = useAtom(userAtom);
    const router = useRouter();
    const isCompact = useIsCompact();
    const compact = isCompact || renderCompact;
    const [relationshipState, setRelationshipState] = useState<RelationshipState | null>(null);
    const [isOpeningMessage, setIsOpeningMessage] = useState(false);
    const [isSendingConnect, setIsSendingConnect] = useState(false);
    const [isAcceptingConnect, setIsAcceptingConnect] = useState(false);
    const [isDecliningConnect, setIsDecliningConnect] = useState(false);
    const relationshipRequestRef = useRef(0);
    const { toast } = useToast();

    const mapRelationshipState = useCallback(
        (state: Awaited<ReturnType<typeof getProfileRelationshipStateAction>>) =>
            state
                ? {
                      dmAllowed: state.dmAllowed,
                      showConnect: state.showConnect,
                      connectLabel: state.connectLabel,
                      messageVisibilityReason: state.messageVisibilityReason,
                      connectLabelReason: state.connectLabelReason,
                  }
                : null,
        [],
    );

    const loadRelationshipState = useCallback(async (requestId: number, targetDid: string) => {
        try {
            const state = await getProfileRelationshipStateAction(targetDid);
            if (relationshipRequestRef.current !== requestId) {
                return;
            }

            setRelationshipState(mapRelationshipState(state));
        } catch (error) {
            if (relationshipRequestRef.current !== requestId) {
                return;
            }

            console.error("Failed to load relationship state:", error);
            setRelationshipState(null);
        }
    }, [mapRelationshipState]);

    const reloadRelationshipState = useCallback(async () => {
        if (!user?.did || !circle?.did || circle._id === user._id || circle.circleType !== "user") {
            relationshipRequestRef.current += 1;
            setRelationshipState(null);
            return;
        }

        const requestId = ++relationshipRequestRef.current;
        await loadRelationshipState(requestId, circle.did);
    }, [circle?._id, circle?.circleType, circle?.did, loadRelationshipState, user?._id, user?.did]);

    useEffect(() => {
        relationshipRequestRef.current += 1;
        setRelationshipState(null);

        if (!user?.did || !circle?.did || circle._id === user._id || circle.circleType !== "user") {
            return;
        }

        const requestId = relationshipRequestRef.current;
        void loadRelationshipState(requestId, circle.did);

        return () => {
            relationshipRequestRef.current += 1;
        };
    }, [circle?._id, circle?.did, circle?.circleType, loadRelationshipState, user?._id, user?.did]);

    useEffect(() => {
        const handleVisibilityRefresh = () => {
            if (document.visibilityState === "visible") {
                void reloadRelationshipState();
            }
        };

        const handleFocusRefresh = () => {
            void reloadRelationshipState();
        };

        window.addEventListener("focus", handleFocusRefresh);
        document.addEventListener("visibilitychange", handleVisibilityRefresh);

        return () => {
            window.removeEventListener("focus", handleFocusRefresh);
            document.removeEventListener("visibilitychange", handleVisibilityRefresh);
        };
    }, [reloadRelationshipState]);

    if (!circle || circle._id === user?._id || circle.circleType !== "user" || !relationshipState) {
        return null;
    }

    const isConnectPresentationOnly =
        relationshipState.connectLabelReason === "pending_sent" ||
        relationshipState.connectLabelReason === "pending_received";
    const isRespondingToConnect = isAcceptingConnect || isDecliningConnect;

    const handleConnectRequest = async () => {
        if (!circle?.did || isSendingConnect || isRespondingToConnect || isConnectPresentationOnly) {
            return;
        }

        setIsSendingConnect(true);
        try {
            const result = await sendConnectRequestAction(circle.did);

            if (!result.success) {
                toast({
                    title: relationshipState.connectLabel || "Add Contact",
                    description: result.message,
                });
                return;
            }

            await reloadRelationshipState();
            router.refresh();

            toast({
                title: "Contact request sent",
                description: "This profile now shows as Requested.",
            });
        } catch (error) {
            console.error("Failed to send connect request:", error);
            toast({
                title: relationshipState.connectLabel || "Add Contact",
                description: "Failed to send contact request",
            });
        } finally {
            setIsSendingConnect(false);
        }
    };

    const handleAcceptRequest = async () => {
        if (!circle?.did || isSendingConnect || isRespondingToConnect) {
            return;
        }

        setIsAcceptingConnect(true);
        try {
            const result = await acceptConnectRequestAction(circle.did);
            if (!result.success) {
                toast({
                    title: "Accept contact request",
                    description: result.message,
                });
                return;
            }

            await reloadRelationshipState();
            router.refresh();

            toast({
                title: "Contact request accepted",
                description: "Messaging is now available for this contact.",
            });
        } catch (error) {
            console.error("Failed to accept connect request:", error);
            toast({
                title: "Accept contact request",
                description: "Failed to accept contact request",
            });
        } finally {
            setIsAcceptingConnect(false);
        }
    };

    const handleDeclineRequest = async () => {
        if (!circle?.did || isSendingConnect || isRespondingToConnect) {
            return;
        }

        setIsDecliningConnect(true);
        try {
            const result = await declineConnectRequestAction(circle.did);
            if (!result.success) {
                toast({
                    title: "Decline contact request",
                    description: result.message,
                });
                return;
            }

            await reloadRelationshipState();
            router.refresh();

            toast({
                title: "Contact request declined",
                description: "The request was cleared.",
            });
        } catch (error) {
            console.error("Failed to decline connect request:", error);
            toast({
                title: "Decline contact request",
                description: "Failed to decline contact request",
            });
        } finally {
            setIsDecliningConnect(false);
        }
    };

    const handleMessageClick = async () => {
        if (!circle?.did || isOpeningMessage) {
            return;
        }

        setIsOpeningMessage(true);
        try {
            const result = await findOrCreateDMConversationAction(circle, { source: "profile" });
            const conversationId = result.chatRoom?._id || result.chatRoom?.handle;
            if (!result.success || !conversationId) {
                toast({
                    title: "Message",
                    description: result.message || "Could not open the direct message",
                    variant: "destructive",
                });
                return;
            }

            router.push(`/chat/${conversationId}`);
        } catch (error) {
            console.error("Failed to open profile DM:", error);
            toast({
                title: "Message",
                description: error instanceof Error ? error.message : "Could not open the direct message",
                variant: "destructive",
            });
        } finally {
            setIsOpeningMessage(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button
                variant="outline"
                className="gap-2 rounded-full"
                data-message-reason={relationshipState.messageVisibilityReason}
                disabled={isOpeningMessage}
                onClick={() => void handleMessageClick()}
            >
                {isOpeningMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <TbMessage className="h-4 w-4" />}
                {isOpeningMessage ? "Opening..." : "Message"}
            </Button>
            {!relationshipState.dmAllowed && relationshipState.showConnect && (
                relationshipState.connectLabelReason === "pending_received" ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                className="rounded-full"
                                disabled={isSendingConnect || isRespondingToConnect}
                            >
                                {isRespondingToConnect ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                                Respond
                                <ChevronDown className="ml-1 h-3.5 w-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => void handleAcceptRequest()}>Accept</DropdownMenuItem>
                            <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onSelect={() => void handleDeclineRequest()}
                            >
                                Decline
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Button
                        variant="ghost"
                        size={compact ? "sm" : "default"}
                        className={compact ? "rounded-full px-3" : "rounded-full text-muted-foreground"}
                        data-connect-reason={relationshipState.connectLabelReason}
                        disabled={isSendingConnect || isRespondingToConnect || isConnectPresentationOnly}
                        onClick={handleConnectRequest}
                    >
                        {isSendingConnect ? "Sending..." : relationshipState.connectLabel || "Add Contact"}
                    </Button>
                )
            )}
        </div>
    );
};

export default MessageButton;
