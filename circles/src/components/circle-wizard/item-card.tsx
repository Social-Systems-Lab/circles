import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cause, Skill } from "@/models/models";
import Image from "next/image";
import { CheckCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import Indicators from "../utils/indicators";
import { sdgs } from "@/lib/data/sdgs";
import { skills } from "@/lib/data/skills";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Item = Cause | Skill;

interface ItemGridCardProps {
    item: Item;
    isSelected: boolean;
    onToggle: (item: Item) => void;
    isCause?: boolean;
    count?: number;
}

export const ItemGridCard = ({ item, isSelected, onToggle, isCause, count }: ItemGridCardProps) => {
    let itemc = isCause ? sdgs.find((x) => x.name === item.name) : skills.find((x) => x.name === item.name);

    return (
        <Card
            onClick={() => onToggle(item)}
            className={cn(
                "formatted relative cursor-pointer transition-all duration-200 hover:shadow-lg",
                isSelected ? "border-2 border-blue-500 shadow-lg" : "border",
                isCause ? "overflow-hidden" : "",
            )}
        >
            <CardHeader className="relative flex items-center justify-center space-y-0 p-0">
                {typeof count === "number" && count > 0 && (
                    <div className="absolute left-2 top-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold shadow">
                        {count}
                    </div>
                )}
                {isCause ? (
                    <Image
                        src={itemc?.picture?.url ?? "/images/default-picture.png"}
                        alt={item.name}
                        width={200}
                        height={200}
                        className="aspect-square w-full object-cover"
                    />
                ) : (
                    <div className="relative mb-3 mt-1 h-[90px] w-[90px] rounded-full shadow-lg">
                        <Image
                            src={itemc?.picture?.url ?? "/images/default-picture.png"}
                            alt={item.name}
                            width={100}
                            height={100}
                            className="h-full w-full rounded-full object-cover"
                            style={{ clipPath: "url(#clip-sdg-100)" }}
                        />
                    </div>
                )}
                {isSelected && (
                    <div className="absolute right-2 top-2 rounded-full bg-white">
                        <CheckCircle className="h-6 w-6 text-blue-500" />
                    </div>
                )}
            </CardHeader>
        </Card>
    );
};

interface ItemListCardProps {
    item: Item;
    isSelected: boolean;
    onToggle: (item: Item) => void;
}

export const ItemListCard = ({ item, isSelected, onToggle }: ItemListCardProps) => {
    return (
        <Card
            onClick={() => onToggle(item)}
            className={cn(
                "relative mb-4 cursor-pointer transition-all duration-200 hover:shadow-lg",
                isSelected ? "border-2 border-blue-500 shadow-lg" : "border",
            )}
        >
            <CardContent className="flex items-center p-4">
                <div className="relative mr-4 h-[60px] w-[60px] flex-shrink-0">
                    <Image
                        src={item.picture?.url ?? "/images/default-picture.png"}
                        alt={item.name}
                        layout="fill"
                        className="rounded-full object-cover"
                    />
                </div>
                <div className="flex-grow">
                    <h3 className="text-lg font-semibold">{item.name}</h3>
                    <p className="text-sm text-gray-600">{item.description}</p>
                </div>
                {isSelected && (
                    <div className="ml-4 rounded-full bg-white">
                        <CheckCircle className="h-8 w-8 text-blue-500" />
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

interface ItemSelectionProps {
    items: Item[];
    selectedItems: Item[];
    onToggle: (item: Item) => void;
    isCause?: boolean;
    gridCols?: string;
    causeCounts?: Record<string, number>;
}

export const ItemGrid = ({ items, selectedItems, onToggle, isCause, gridCols, causeCounts }: ItemSelectionProps) => {
    return (
        <div className={cn("grid gap-4", gridCols || "grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6")}>
            {items.map((item) => (
                <ItemGridCard
                    key={item.handle}
                    item={item}
                    isSelected={selectedItems.some((i) => i.handle === item.handle)}
                    onToggle={onToggle}
                    isCause={isCause}
                    count={causeCounts ? (causeCounts[item.handle] ?? 0) : undefined}
                />
            ))}
        </div>
    );
};

export const ItemList = ({ items, selectedItems, onToggle }: ItemSelectionProps) => {
    return (
        <div>
            {items.map((item) => (
                <ItemListCard
                    key={item.handle}
                    item={item}
                    isSelected={selectedItems.some((i) => i.handle === item.handle)}
                    onToggle={onToggle}
                />
            ))}
        </div>
    );
};
