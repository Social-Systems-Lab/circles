"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { userAtom } from "@/lib/data/atoms";
import { Circle } from "@/models/models";
import { useAtom } from "jotai";
import { getProfileRelationshipStateAction, sendConnectRequestAction } from "./actions";
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
    connectLabel: "Connect" | "Add Contact" | "Requested" | null;
    messageVisibilityReason:
        | "self"
        | "existing_dm_history"
        | "dm_permission_contact"
        | "dm_permission_legacy_dm"
        | "dm_permission_recipient_setting"
        | "dm_not_allowed";
    connectLabelReason: "message_available" | "pending_sent" | "contact_not_established" | "contact_established";
};

export const MessageButton = ({ circle, renderCompact }: MessageButtonProps) => {
    const [user] = useAtom(userAtom);
    const isCompact = useIsCompact();
    const compact = isCompact || renderCompact;
    const [showDM, setShowDM] = useState(false);
    const [relationshipState, setRelationshipState] = useState<RelationshipState | null>(null);
    const [isSendingConnect, setIsSendingConnect] = useState(false);
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

    const handleConnectRequest = async () => {
        if (!circle?.did || isSendingConnect || relationshipState.connectLabel === "Requested") {
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

            const state = await getProfileRelationshipStateAction(circle.did);
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

    if (!relationshipState.dmAllowed) {
        if (!relationshipState.showConnect) {
            return null;
        }

        return (
            <Button
                variant="ghost"
                size={compact ? "sm" : "default"}
                className={compact ? "rounded-full px-3" : "rounded-full text-muted-foreground"}
                data-connect-reason={relationshipState.connectLabelReason}
                disabled={isSendingConnect || relationshipState.connectLabel === "Requested"}
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
