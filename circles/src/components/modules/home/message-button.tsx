"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { userAtom } from "@/lib/data/atoms";
import { Circle } from "@/models/models";
import { useAtom } from "jotai";
import { getProfileRelationshipStateAction } from "./actions";
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
};

export const MessageButton = ({ circle, renderCompact }: MessageButtonProps) => {
    const [user] = useAtom(userAtom);
    const isCompact = useIsCompact();
    const compact = isCompact || renderCompact;
    const [showDM, setShowDM] = useState(false);
    const [relationshipState, setRelationshipState] = useState<RelationshipState | null>(null);
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

    if (!relationshipState.dmAllowed) {
        if (!relationshipState.showConnect) {
            return null;
        }

        return (
            <Button
                variant="ghost"
                size={compact ? "sm" : "default"}
                className={compact ? "rounded-full px-3" : "rounded-full text-muted-foreground"}
                onClick={() =>
                    toast({
                        title: relationshipState.connectLabel || "Add Contact",
                        description: "Contact requests are not available in this sprint yet.",
                    })
                }
            >
                {relationshipState.connectLabel || "Add Contact"}
            </Button>
        );
    }

    return (
        <>
            <Button variant="outline" className="gap-2 rounded-full" onClick={() => setShowDM(true)}>
                <TbMessage className="h-4 w-4" />
                Message
            </Button>
            {showDM && <DmChatModal recipient={circle} onClose={() => setShowDM(false)} />}
        </>
    );
};

export default MessageButton;
