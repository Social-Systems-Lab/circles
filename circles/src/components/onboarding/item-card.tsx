"use client";

import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

const ItemCard = ({ item, isSelected, onToggle }) => (
    <Card
        className={`cursor-pointer border-0 shadow-lg transition-all ${isSelected ? "ring ring-[#66a5ff]" : ""}`}
        onClick={() => onToggle(item)}
    >
        <CardContent className="relative flex flex-col items-center p-2 text-center">
            {item.picture && (
                <div className="relative mb-3 mt-1 h-[90px] w-[90px] overflow-hidden rounded-full">
                    {/* clip-cause-100  */}
                    <Image src={item.picture.url} alt={item.name} width={90} height={90} className="" />
                    {/* rounded-full */}
                </div>
            )}
            <h3 className="mb-0 mt-0  text-sm font-semibold">{item.name}</h3>
            <p className="mt-1 line-clamp-2 text-xs text-gray-600">{item.description}</p>
            {item.metric && <p className="mt-1 text-xs text-blue-600">{item.metric}</p>}
            {item.goal && <p className="mt-1 text-xs text-green-600">{item.goal}</p>}
            {/* {item.champions && (
                <Badge variant="secondary" className="mt-1">
                    {item.champions.toLocaleString()} champions
                </Badge>
            )} */}
            {item.story && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="absolute right-2 top-2 flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-blue-500">
                                <span className="text-xs font-bold text-white">i</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="max-w-xs">{item.story}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
        </CardContent>
    </Card>
);

export default ItemCard;
