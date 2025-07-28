import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cause, Skill } from "@/models/models";
import Image from "next/image";
import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Indicators from "../utils/indicators";
import { sdgs } from "@/lib/data/sdgs";
import { skills } from "@/lib/data/skills";

type Item = Cause | Skill;

interface ItemGridCardProps {
    item: Item;
    isSelected: boolean;
    onToggle: (item: Item) => void;
    isCause?: boolean;
}

export const ItemGridCard = ({ item, isSelected, onToggle, isCause }: ItemGridCardProps) => {
    let itemc = isCause ? sdgs.find((x) => x.name === item.name) : skills.find((x) => x.name === item.name);

    return (
        <Card
            onClick={() => onToggle(item)}
            className={cn(
                "relative cursor-pointer transition-all duration-200 hover:shadow-lg",
                isSelected ? "border-2 border-blue-500 shadow-lg" : "border",
            )}
        >
            <CardHeader className="relative p-0">
                <div className="relative mb-3 mt-1 h-[90px] w-[90px] rounded-full shadow-lg">
                    {/* clip-sdg-100  */}
                    <Image
                        src={itemc?.picture?.url ?? "/images/default-picture.png"}
                        alt={item.name}
                        width={100}
                        height={100}
                        className="h-full w-full rounded-full object-cover"
                        style={{ clipPath: "url(#clip-sdg-100)" }}
                    />
                </div>
                {isSelected && (
                    <div className="absolute right-2 top-2 rounded-full bg-white">
                        <CheckCircle className="h-6 w-6 text-blue-500" />
                    </div>
                )}
            </CardHeader>
            <CardContent className="p-4">
                <CardTitle className="mb-2 text-base font-semibold">{item.name}</CardTitle>
                <p className="text-xs text-gray-600">{item.description}</p>
            </CardContent>
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
}

export const ItemGrid = ({ items, selectedItems, onToggle, isCause }: ItemSelectionProps) => {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
                <ItemGridCard
                    key={item.handle}
                    item={item}
                    isSelected={selectedItems.some((i) => i.handle === item.handle)}
                    onToggle={onToggle}
                    isCause={isCause}
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
