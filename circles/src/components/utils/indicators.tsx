import { AudioLines, Zap, MapPin, Star } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Metrics } from "@/models/models";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";

interface VibeScoreProps {
    score: number;
}

export function VibeScore({ score }: VibeScoreProps) {
    const formattedScore = (1 + score * 100).toFixed(0);
    // const color = score > 0.7 ? "text-green-500" : score > 0.4 ? "text-yellow-500" : "text-red-500";
    const color = "text-[#ac22c3]";
    // #c1449f #ac22c3

    return (
        <HoverCard openDelay={200}>
            <HoverCardTrigger>
                <div className="flex items-center space-x-1">
                    <AudioLines className={`h-3 w-3 ${color}`} />
                    <span className={`text-[12px] font-medium ${color}`}>{formattedScore}</span>
                </div>
            </HoverCardTrigger>
            <HoverCardContent className="z-[500] w-[300px] p-2 pt-[6px]">
                <p>
                    <AudioLines className={`mr-1 h-5 w-5 ${color} inline-block`} />
                    <b>Vibe:</b> How much your profile resonates with this content (lower number means higher resonance)
                </p>
            </HoverCardContent>
        </HoverCard>
    );
}

interface ProximityIndicatorProps {
    distance: number;
}

export function ProximityIndicator({ distance }: ProximityIndicatorProps) {
    const color = "text-[#c3224d]";

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

    return (
        <HoverCard openDelay={200}>
            <HoverCardTrigger>
                <div className="flex items-center space-x-1">
                    <MapPin className={`h-3 w-3 ${color}`} />
                    <span className={`text-[12px] font-medium ${color}`}>{getDistanceString()}</span>
                </div>
            </HoverCardTrigger>
            <HoverCardContent className="z-[500] w-[300px] p-2 pt-[6px]">
                <p>
                    <MapPin className={`mr-1 h-5 w-5 ${color} inline-block`} />
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
}

export function Indicators({ metrics, className }: IndicatorsProps) {
    return (
        <div
            className={cn(
                "flex items-center justify-center space-x-2 rounded-lg bg-white pl-1 pr-2 shadow-md",
                className,
            )}
        >
            {/* rounded-lg bg-white p-4 shadow */}
            {/* Render VibeScore if 'vibe' is defined */}
            {metrics.vibe !== undefined && <VibeScore score={metrics.vibe} />}

            {/* Render ProximityIndicator if 'proximity' is defined */}
            {metrics.distance !== undefined && <ProximityIndicator distance={metrics.distance} />}

            {/* Render PopularityIndicator if 'popularity' is defined */}
            {/* {metrics.popularity !== undefined && <PopularityIndicator score={metrics.popularity} />} */}
        </div>
    );
}

export default Indicators;
