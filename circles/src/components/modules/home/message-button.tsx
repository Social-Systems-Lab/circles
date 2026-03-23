"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { TbMessage } from "react-icons/tb";
import { DmChatModal } from "../chat/dm-chat-modal";

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
    const isCompact = useIsCompact();
    const compact = isCompact || renderCompact;
    const [showDM, setShowDM] = useState(false);
    const [relationshipState, setRelationshipState] = useState<RelationshipState | null>(null);
    const [isSendingConnect, setIsSendingConnect] = useState(false);
    const [isAcceptingConnect, setIsAcceptingConnect] = useState(false);
    const [isDecliningConnect, setIsDecliningConnect] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        let cancelled = false;

        const loadRelationshipState = async () => {
            if (!user?.did || !circle?.did || circle._id === user._id || circle.circleType !== "user") {
                if (!cancelled) {
                    setRelationshipState(null);
                }
                return;
            }

            try {
                const state = await getProfileRelationshipStateAction(circle.did);
                if (!cancelled) {
                    setRelationshipState(
                        state
                            ? {
                                  dmAllowed: state.dmAllowed,
                                  showConnect: state.showConnect,
                                  connectLabel: state.connectLabel,
                                  messageVisibilityReason: state.messageVisibilityReason,
                                  connectLabelReason: state.connectLabelReason,
                              }
                            : null,
                    );
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("Failed to load relationship state:", error);
                    setRelationshipState(null);
                }
            }
        };

        void loadRelationshipState();

        return () => {
            cancelled = true;
        };
    }, [circle?._id, circle?.did, circle?.circleType, user?._id, user?.did]);

    if (!circle || circle._id === user?._id || circle.circleType !== "user" || !relationshipState) {
        return null;
    }

    const isConnectPresentationOnly =
        relationshipState.connectLabelReason === "pending_sent" ||
        relationshipState.connectLabelReason === "pending_received";
    const isRespondingToConnect = isAcceptingConnect || isDecliningConnect;

    const mapRelationshipState = (state: Awaited<ReturnType<typeof getProfileRelationshipStateAction>>) =>
        state
            ? {
                  dmAllowed: state.dmAllowed,
                  showConnect: state.showConnect,
                  connectLabel: state.connectLabel,
                  messageVisibilityReason: state.messageVisibilityReason,
                  connectLabelReason: state.connectLabelReason,
              }
            : null;

    const reloadRelationshipState = async () => {
        if (!circle?.did) {
            setRelationshipState(null);
            return;
        }

        const state = await getProfileRelationshipStateAction(circle.did);
        setRelationshipState(mapRelationshipState(state));
    };

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

    if (!relationshipState.dmAllowed) {
        if (!relationshipState.showConnect) {
            return null;
        }

        if (relationshipState.connectLabelReason === "pending_received") {
            return (
                <div className="flex flex-wrap items-center gap-2" data-connect-reason={relationshipState.connectLabelReason}>
                    <Button
                        size={compact ? "sm" : "default"}
                        className="rounded-full"
                        disabled={isSendingConnect || isRespondingToConnect}
                        onClick={handleAcceptRequest}
                    >
                        {isAcceptingConnect ? "Accepting..." : "Accept"}
                    </Button>
                    <Button
                        variant="ghost"
                        size={compact ? "sm" : "default"}
                        className={compact ? "rounded-full px-3 text-muted-foreground" : "rounded-full text-muted-foreground"}
                        disabled={isSendingConnect || isRespondingToConnect}
                        onClick={handleDeclineRequest}
                    >
                        {isDecliningConnect ? "Declining..." : "Decline"}
                    </Button>
                </div>
            );
        }

        return (
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
        );
    }

    return (
        <>
            <Button
                variant="outline"
                className="gap-2 rounded-full"
                data-message-reason={relationshipState.messageVisibilityReason}
                onClick={() => setShowDM(true)}
            >
                <TbMessage className="h-4 w-4" />
                Message
            </Button>
            {showDM && <DmChatModal recipient={circle} onClose={() => setShowDM(false)} />}
        </>
    );
};

export default MessageButton;
