import { AudioLines, Zap, MapPin, Star } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Metrics } from "@/models/models";
import { cn } from "@/lib/utils";

interface VibeScoreProps {
    score: number;
}

export function VibeScore({ score }: VibeScoreProps) {
    const formattedScore = (score * 100).toFixed(0);
    // const color = score > 0.7 ? "text-green-500" : score > 0.4 ? "text-yellow-500" : "text-red-500";
    const color = "text-[#ac22c3]";
    // #c1449f #ac22c3

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center space-x-1 rounded-lg bg-white pl-1 pr-1 shadow-md">
                        <AudioLines className={`h-3 w-3 ${color}`} />
                        <span className={`text-[12px] font-medium ${color}`}>{formattedScore}</span>
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Vibe Score: How much you resonate with this content (lower number means higher resonance)</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

interface ProximityIndicatorProps {
    distance: number;
}

export function ProximityIndicator({ distance }: ProximityIndicatorProps) {
    const formattedDistance = distance.toFixed(1);
    const unit = distance > 1 ? "km" : "m";

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center space-x-1">
                        <MapPin className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium text-blue-500">
                            {formattedDistance} {unit}
                        </span>
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Distance from your location</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
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
        <div className={cn("flex space-x-4", className)}>
            {/* rounded-lg bg-white p-4 shadow */}
            {/* Render VibeScore if 'vibe' is defined */}
            {metrics.vibe !== undefined && <VibeScore score={metrics.vibe} />}

            {/* Render ProximityIndicator if 'proximity' is defined */}
            {metrics.proximity && <ProximityIndicator distance={metrics.proximity} />}

            {/* Render PopularityIndicator if 'popularity' is defined */}
            {metrics.popularity !== undefined && <PopularityIndicator score={metrics.popularity} />}
        </div>
    );
}

export default Indicators;
