import { AudioLines, Zap, MapPin, Star } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Content, Metrics } from "@/models/models";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { mapOpenAtom, triggerMapOpenAtom, zoomContentAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";

interface SimilarityScoreProps {
    score: number;
    color?: string;
    size?: string;
}

export function SimilarityScore({ score, color, size }: SimilarityScoreProps) {
    const formattedScore = (101 - score * 100).toFixed(0);
    const defaultColor = "#ac22c3";
    const iconColor = color ?? defaultColor;
    const iconSize = size ?? "0.75rem";

    return (
        <HoverCard openDelay={200}>
            <HoverCardTrigger>
                <div className="flex items-center space-x-1">
                    <AudioLines className={``} style={{ color: iconColor, width: iconSize, height: iconSize }} />
                    <span className={` font-medium`} style={{ color: iconColor }}>
                        {formattedScore}
                    </span>
                </div>
            </HoverCardTrigger>
            <HoverCardContent className="z-[500] w-[300px] p-2 pt-[6px] text-[14px]">
                <p>
                    <AudioLines className={`mr-1 inline-block h-5 w-5`} style={{ color: defaultColor }} />
                    <b>Similarity:</b> How similar your profile is to this content (lower number means higher
                    similarity)
                </p>
            </HoverCardContent>
        </HoverCard>
    );
}

interface ProximityIndicatorProps {
    distance: number;
    color?: string;
    content?: Content;
    size?: string;
    onMapPinClick?: () => void;
}

export function ProximityIndicator({ distance, color, content, size, onMapPinClick }: ProximityIndicatorProps) {
    const defaultColor = "#c3224d";
    const iconColor = color ?? defaultColor;
    const [, setZoomContent] = useAtom(zoomContentAtom);
    const [, setTriggerOpen] = useAtom(triggerMapOpenAtom);
    const iconSize = size ?? "0.75rem";

    const getDistanceString = () => {
        if (!distance) {
            return "";
        }
        if (distance < 1) {
            return `${Math.round(distance * 1000)} m`;
        }
        if (distance < 10) {
            return `${distance.toFixed(1)} km`;
        }
        if (distance < 100) {
            return `${(distance / 10).toFixed(1)} mil`;
        }

        return `${(distance / 10).toFixed(0)} mil`;
    };

    const handleMapPinClick = () => {
        if (onMapPinClick) {
            onMapPinClick();
            return;
        }

        if (!content) {
            return;
        }
        setZoomContent(content);
        setTriggerOpen(true);
    };

    return (
        <HoverCard openDelay={200}>
            <HoverCardTrigger>
                <div
                    className="flex cursor-pointer items-center space-x-1"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleMapPinClick();
                    }}
                >
                    <MapPin
                        className={``}
                        style={{
                            color: iconColor,
                            width: iconSize,
                            height: iconSize,
                        }}
                    />
                    <span className={`font-medium`} style={{ color: iconColor }}>
                        {getDistanceString()}
                    </span>
                </div>
            </HoverCardTrigger>
            <HoverCardContent className="z-[500] w-[300px] p-2 pt-[6px] text-[14px]">
                <p>
                    <MapPin className={`mr-1 inline-block h-5 w-5`} style={{ color: defaultColor }} />
                    <b>Proximity:</b> Distance from your location.
                </p>
            </HoverCardContent>
        </HoverCard>
    );
}

interface PopularityIndicatorProps {
    score: number;
}

export function PopularityIndicator({ score }: PopularityIndicatorProps) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium text-yellow-500">{score}</span>
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Popularity score based on user engagement</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

interface IndicatorsProps {
    metrics: Metrics;
    className?: string;
    color?: string;
    content?: Content;
    size?: string;
    onMapPinClick?: () => void;
}

export function Indicators({ metrics, className, color, content, size, onMapPinClick }: IndicatorsProps) {
    return (
        <div
            className={cn(
                "flex items-center justify-center space-x-2 rounded-lg bg-white pl-1 pr-2 text-[12px] shadow-md",
                className,
            )}
        >
            {/* rounded-lg bg-white p-4 shadow */}
            {metrics.similarity !== undefined && (
                <SimilarityScore score={metrics.similarity} color={color} size={size} />
            )}

            {/* Render ProximityIndicator if 'proximity' is defined */}
            {metrics.distance !== undefined && (
                <ProximityIndicator
                    distance={metrics.distance}
                    color={color}
                    content={content}
                    size={size}
                    onMapPinClick={onMapPinClick}
                />
            )}

            {/* Render PopularityIndicator if 'popularity' is defined */}
            {/* {metrics.popularity !== undefined && <PopularityIndicator score={metrics.popularity} />} */}
        </div>
    );
}

export default Indicators;
