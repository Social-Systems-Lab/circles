// item-card.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import Indicators from "../utils/indicators";
import { causes, skills } from "@/lib/data/constants";

type ItemGridCardProps = {
    item: any;
    isSelected: boolean;
    onToggle: (item: any) => void;
    isCause: boolean;
};
export const ItemGridCard = ({ item, isSelected, onToggle, isCause }: ItemGridCardProps) => {
    let itemc = isCause ? causes.find((x) => x.name === item.name) : skills.find((x) => x.name === item.name);

    return (
        <Card
            className={`cursor-pointer border-0 shadow-lg transition-all ${isSelected ? "ring ring-[#66a5ff]" : ""}`}
            onClick={() => onToggle(item)}
        >
            <CardContent className="relative flex flex-col items-center p-2 text-center">
                {itemc?.picture && (
                    <div className="relative mb-3 mt-1 h-[90px] w-[90px] rounded-full shadow-lg">
                        {/* clip-cause-100  */}
                        <Image
                            src={itemc.picture.url}
                            alt={item.name}
                            width={90}
                            height={90}
                            className="rounded-full"
                        />
                        {/* rounded-full */}
                    </div>
                )}

                <h3 className="mb-0 mt-0  text-sm font-semibold">{item.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">{item.description}</p>

                {/* Render the indicators if metrics are provided */}
                {item.metrics && <Indicators metrics={item.metrics} className="absolute left-2 top-2" content={item} />}

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
};

type ItemListCardProps = {
    item: any;
    isSelected: boolean;
    onToggle: (item: any) => void;
};

export const ItemListCard = ({ item, isSelected, onToggle }: ItemListCardProps) => {
    return (
        <Card
            className={`flex cursor-pointer items-center border-0 p-2 shadow-lg transition-all ${isSelected ? "ring ring-[#66a5ff]" : ""}`}
            onClick={() => onToggle(item)}
        >
            {item.picture && (
                <div className="relative h-[50px] w-[50px] shrink-0 overflow-hidden rounded-full">
                    <Image src={item.picture.url} alt={item.name} width={50} height={50} />
                </div>
            )}

            <div className="ml-3 flex flex-col">
                <h3 className="m-0 p-0 text-sm font-semibold">{item.name}</h3>
                <p className="line-clamp-2 text-xs text-gray-600">{item.description}</p>
            </div>
        </Card>
    );
};

type ItemGridProps = {
    items: any[];
    selectedItems: any[];
    onToggle: (item: any) => void;
    isCause: boolean;
};

export const ItemGrid = ({ items, selectedItems, onToggle, isCause }: ItemGridProps) => {
    return (
        <div className="grid grid-cols-3 gap-4 p-2">
            {items.map((item) => (
                <ItemGridCard
                    key={item.handle}
                    item={item}
                    isSelected={selectedItems.some((c) => c.handle === item.handle)}
                    onToggle={onToggle}
                    isCause={isCause}
                />
            ))}
        </div>
    );
};

type ItemListProps = {
    items: any[];
    selectedItems: any[];
    onToggle: (item: any) => void;
};

export const ItemList = ({ items, selectedItems, onToggle }: ItemListProps) => {
    return (
        <div className="space-y-2 p-1">
            {items.map((item) => (
                <ItemListCard
                    key={item.handle}
                    item={item}
                    isSelected={selectedItems.some((c) => c.handle === item.handle)}
                    onToggle={onToggle}
                />
            ))}
        </div>
    );
};
