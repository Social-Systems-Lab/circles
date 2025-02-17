import { useState } from "react";
import { useIsCompact } from "./use-is-compact";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { AudioLines, Clock, MapPin, Star } from "lucide-react";

type ListFilterProps = {
    onFilterChange?: (filter: string) => void;
};

export const ListFilter = ({ onFilterChange }: ListFilterProps) => {
    const [filter, setFilter] = useState("top");
    const isCompact = useIsCompact();

    const onValueChange = (value: string) => {
        setFilter(value);
        if (onFilterChange) {
            onFilterChange(value);
        }
    };

    return (
        <div className={`${isCompact ? "w-full" : "w-[300px]"} py-1 pb-2`}>
            <RadioGroup defaultValue="top" onValueChange={onValueChange} className="flex space-x-1">
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
        </div>
    );
};
