"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { userAtom } from "@/lib/data/atoms";
import { Circle } from "@/models/models";
import { useAtom } from "jotai";
import { usePathname, useRouter } from "next/navigation";
import { joinCircle, leaveCircle, cancelJoinRequest } from "./actions";
import { useToast } from "@/components/ui/use-toast";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, MoreVertical } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { CircleQuestionnaireDialog } from "./questionnaire-dialog";
import { TbMessage } from "react-icons/tb";
import { DmChatModal } from "../chat/dm-chat-modal";

type MessageButton = {
    circle: Circle;
    renderCompact?: boolean;
};

export const MessageButton = ({ circle, renderCompact }: MessageButton) => {
    const [user, setUser] = useAtom(userAtom);
    const isCompact = useIsCompact();
    const compact = isCompact || renderCompact;
    const [showDM, setShowDM] = useState(false);

    const onMessageClick = () => {
        setShowDM(true);
    };

    if (!circle || circle._id === user?._id) {
        return null;
    }

    return (
        <>
            <Button variant="outline" className={"gap-2 rounded-full"} onClick={onMessageClick}>
                <TbMessage className="h-4 w-4" />
                {"Message"}
            </Button>
            {showDM && <DmChatModal recipient={circle} onClose={() => setShowDM(false)} />}
        </>
    );
};

export default MessageButton;
