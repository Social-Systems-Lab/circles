import { useState } from "react";
import { useIsCompact } from "./use-is-compact";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { AudioLines, Clock, MapPin, Star } from "lucide-react";
import { BiRefresh } from "react-icons/bi";
import SdgFilter from "../modules/search/sdg-filter";
import { Cause as SDG } from "@/models/models";
import { Button } from "../ui/button";
import Image from "next/image";

type ListFilterProps = {
    onFilterChange?: (filter: string) => void;
    onSdgChange?: (sdgs: SDG[]) => void;
    selectedSdgs?: SDG[];
    defaultValue?: string;
};

export const ListFilter = ({
    onFilterChange,
    onSdgChange,
    selectedSdgs = [],
    defaultValue = "top",
}: ListFilterProps) => {
    const [filter, setFilter] = useState(defaultValue);
    const isCompact = useIsCompact();

    const onValueChange = (value: string) => {
        setFilter(value);
        if (onFilterChange) {
            onFilterChange(value);
        }
    };

    return (
        <div className={`${isCompact ? "w-full" : "w-auto"} py-1 pb-2`}>
            <div className="flex items-center space-x-1">
                <RadioGroup defaultValue={defaultValue} onValueChange={onValueChange} className="flex flex-1 space-x-1">
                    <div className="flex-1">
                        <RadioGroupItem value="top" id="top" className="peer sr-only" />
                        <Label
                            htmlFor="top"
                            className="flex h-8 cursor-pointer items-center justify-center border-b-2 border-transparent px-2 peer-data-[state=checked]:border-blue-500 dark:hover:bg-gray-800 dark:peer-data-[state=checked]:border-blue-400 dark:peer-data-[state=checked]:bg-blue-900"
                        >
                            <Star className="mr-1 h-[18px] w-[18px] text-gray-500 peer-data-[state=checked]:text-blue-500 dark:text-gray-400 dark:peer-data-[state=checked]:text-blue-400" />
                            <span className="text-[13px] font-medium text-gray-700 peer-data-[state=checked]:text-blue-500 dark:text-gray-300 dark:peer-data-[state=checked]:text-blue-400">
                                Top
                            </span>
                        </Label>
                    </div>
                    <div className="flex-1">
                        <RadioGroupItem value="near" id="near" className="peer sr-only" />
                        <Label
                            htmlFor="near"
                            className="flex h-8 cursor-pointer items-center justify-center border-b-2 border-transparent px-2 peer-data-[state=checked]:border-blue-500 dark:hover:bg-gray-800 dark:peer-data-[state=checked]:border-blue-400 dark:peer-data-[state=checked]:bg-blue-900"
                        >
                            <MapPin className="mr-1 h-[18px] w-[18px] text-gray-500 peer-data-[state=checked]:text-blue-500 dark:text-gray-400 dark:peer-data-[state=checked]:text-blue-400" />
                            <span className="text-[13px] font-medium text-gray-700 peer-data-[state=checked]:text-blue-500 dark:text-gray-300 dark:peer-data-[state=checked]:text-blue-400">
                                Near
                            </span>
                        </Label>
                    </div>
                    <div className="flex-1">
                        <RadioGroupItem value="new" id="new" className="peer sr-only" />
                        <Label
                            htmlFor="new"
                            className="flex h-8 cursor-pointer items-center justify-center border-b-2 border-transparent px-2 peer-data-[state=checked]:border-blue-500 dark:hover:bg-gray-800 dark:peer-data-[state=checked]:border-blue-400 dark:peer-data-[state=checked]:bg-blue-900"
                        >
                            <Clock className="mr-1 h-[18px] w-[18px] text-gray-500 peer-data-[state=checked]:text-blue-500 dark:text-gray-400 dark:peer-data-[state=checked]:text-blue-400" />
                            <span className="text-[13px] font-medium text-gray-700 peer-data-[state=checked]:text-blue-500 dark:text-gray-300 dark:peer-data-[state=checked]:text-blue-400">
                                New
                            </span>
                        </Label>
                    </div>
                    <div className="flex-1">
                        <RadioGroupItem value="activity" id="activity" className="peer sr-only" />
                        <Label
                            htmlFor="activity"
                            className="flex h-8 cursor-pointer items-center justify-center border-b-2 border-transparent px-2 peer-data-[state=checked]:border-blue-500 dark:hover:bg-gray-800 dark:peer-data-[state=checked]:border-blue-400 dark:peer-data-[state=checked]:bg-blue-900"
                        >
                            <BiRefresh className="mr-1 h-[18px] w-[18px] text-gray-500 peer-data-[state=checked]:text-blue-500 dark:text-gray-400 dark:peer-data-[state=checked]:text-blue-400" />
                            <span className="text-[13px] font-medium text-gray-700 peer-data-[state=checked]:text-blue-500 dark:text-gray-300 dark:peer-data-[state=checked]:text-blue-400">
                                Activity
                            </span>
                        </Label>
                    </div>
                    <div className="flex-1">
                        <RadioGroupItem value="similarity" id="similarity" className="peer sr-only" />
                        <Label
                            htmlFor="similarity"
                            className="flex h-8 cursor-pointer items-center justify-center border-b-2 border-transparent px-2 peer-data-[state=checked]:border-blue-500 dark:hover:bg-gray-800 dark:peer-data-[state=checked]:border-blue-400 dark:peer-data-[state=checked]:bg-blue-900"
                        >
                            <AudioLines className="mr-1 h-[18px] w-[18px] text-gray-500 peer-data-[state=checked]:text-blue-500 dark:text-gray-400 dark:peer-data-[state=checked]:text-blue-400" />
                            <span className="text-[13px] font-medium text-gray-700 peer-data-[state=checked]:text-blue-500 dark:text-gray-300 dark:peer-data-[state=checked]:text-blue-400">
                                Resonates
                            </span>
                        </Label>
                    </div>
                </RadioGroup>
                <div className="flex-shrink-0 self-end">
                    <SdgFilter
                        selectedSdgs={selectedSdgs}
                        onSelectionChange={onSdgChange ? onSdgChange : () => {}}
                        displayAs="popover"
                        gridCols="grid-cols-3"
                        trigger={
                            <Button
                                variant="ghost"
                                className="relative top-[-1px] flex h-8 items-center gap-2 px-2 data-[selected=true]:bg-accent"
                                data-selected={selectedSdgs.length > 0}
                            >
                                {selectedSdgs.length === 0 ? (
                                    <Image
                                        src="/images/sdgs/SDG_Wheel_WEB.png"
                                        alt="SDG Wheel"
                                        width={20}
                                        height={20}
                                    />
                                ) : (
                                    <div className="flex -space-x-2">
                                        {selectedSdgs.slice(0, 3).map((sdg) => (
                                            <Image
                                                key={sdg.handle}
                                                src={sdg.picture?.url ?? "/images/default-picture.png"}
                                                alt={sdg.name}
                                                width={20}
                                                height={20}
                                                className="h-5 w-5 rounded-full border-2 border-white object-cover"
                                            />
                                        ))}
                                    </div>
                                )}
                            </Button>
                        }
                    />
                </div>
            </div>
        </div>
    );
};
