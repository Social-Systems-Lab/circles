"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { contentPreviewAtom, sidePanelContentVisibleAtom } from "@/lib/data/atoms";
import { cn } from "@/lib/utils";
import { Circle, ContentPreviewData } from "@/models/models";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import CircleTypeIndicator from "@/components/utils/circle-type-indicator";

type CirclePictureProps = {
    circle: Circle;
    size?: string;
    className?: string;
    openPreview?: boolean;
    showTypeIndicator?: boolean;
};

export const CirclePicture = ({
    circle,
    size,
    className,
    openPreview,
    showTypeIndicator = false,
}: CirclePictureProps) => {
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const isMobile = useIsMobile();
    const router = useRouter();

    var getInitials = () => {
        let name = circle?.name;
        if (!name) return "";
        var names = name.split(" ");
        var initials = names[0].substring(0, 1).toUpperCase();

        if (names.length > 1) {
            initials += names[names.length - 1].substring(0, 1).toUpperCase();
        }
        return initials;
    };

    const onOpenPreview = (e: React.MouseEvent) => {
        if (isMobile) {
            router.push(`/circle/${circle?.handle}`);
            return;
        }

        // Open preview
        let contentPreviewData: ContentPreviewData = {
            type: "user",
            content: circle,
        };
        setContentPreview((x) =>
            x?.content === circle && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
        e.stopPropagation();
    };

    return (
        <div className={className}>
            <Avatar
                className={`bg-white shadow-lg ${openPreview ? "cursor-pointer" : ""}`}
                onClick={openPreview ? onOpenPreview : undefined}
                style={size ? { width: size, height: size } : {}}
            >
                <AvatarImage src={circle?.picture?.url} />
                <AvatarFallback>{getInitials()}</AvatarFallback>
            </Avatar>

            {/* Only show type indicators in chat list */}
            {showTypeIndicator && (
                <div
                    style={{
                        position: "absolute",
                        right: "-5px",
                        bottom: "-5px",
                        zIndex: 10,
                    }}
                >
                    <CircleTypeIndicator
                        circleType={circle?.circleType || "circle"}
                        size={`${parseInt(size || "40") / 2.5}px`}
                    />
                </div>
            )}
        </div>
    );
};
