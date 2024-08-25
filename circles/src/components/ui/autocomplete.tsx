import { CommandGroup, CommandItem, CommandList, CommandInput } from "./command";
import { Command as CommandPrimitive } from "cmdk";
import React, { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";

import { Skeleton } from "./skeleton";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

import { MapPin } from "lucide-react";
import { RiMapPinLine } from "react-icons/ri";
import { RiMapPinFill } from "react-icons/ri";

interface LocationInputProps extends React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> {
    isConfirmed: boolean;
}

export const LocationInput = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Input>, LocationInputProps>(
    ({ className, isConfirmed, ...props }, ref) => (
        <div className="flex items-center rounded-lg border px-3" cmdk-input-wrapper="">
            {isConfirmed ? (
                <RiMapPinFill className={"mr-2 h-4 w-4 shrink-0 text-[#e54242]"} />
            ) : (
                <RiMapPinLine className={"mr-2 h-4 w-4 shrink-0 text-gray-400"} />
            )}
            <CommandPrimitive.Input
                ref={ref}
                className={cn(
                    "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
                    className,
                )}
                {...props}
            />
        </div>
    ),
);

export type Option = Record<"value" | "label", string> & Record<string, string>;

type AutoCompleteProps = {
    options: Option[];
    emptyMessage: string;
    value?: Option;
    onValueChange?: (value: Option) => void;
    isLoading?: boolean;
    disabled?: boolean;
    placeholder?: string;
    onSearch: (query: string) => void;
    isLocationConfirmed: boolean;
};

export const AutoComplete = ({
    options,
    placeholder,
    emptyMessage,
    value,
    onValueChange,
    disabled,
    onSearch,
    isLocationConfirmed,
    isLoading = false,
}: AutoCompleteProps) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const [isOpen, setOpen] = useState(false);
    const [selected, setSelected] = useState<Option | undefined>(value);
    const [inputValue, setInputValue] = useState<string>(value?.label || "");

    useEffect(() => {
        if (value && value.label !== inputValue) {
            setSelected(value);
            setInputValue(value.label);
        }
    }, [value]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            const input = inputRef.current;
            if (!input) {
                return;
            }

            if (!isOpen) {
                setOpen(true);
            }

            if (event.key === "Enter" && input.value !== "") {
                const optionToSelect = options.find((option) => option.label === input.value);
                if (optionToSelect) {
                    setSelected(optionToSelect);
                    onValueChange?.(optionToSelect);
                }
            }

            if (event.key === "Escape") {
                input.blur();
            }
        },
        [isOpen, options, onValueChange],
    );

    const handleBlur = useCallback(() => {
        setOpen(false);
    }, []);

    const handleSelectOption = useCallback(
        (selectedOption: Option) => {
            setInputValue(selectedOption.label);
            setSelected(selectedOption);
            onValueChange?.(selectedOption);

            setTimeout(() => {
                inputRef?.current?.blur();
            }, 0);
        },
        [onValueChange],
    );

    const handleInputChange = useCallback(
        (search: string) => {
            setInputValue(search);
            if (onSearch) {
                onSearch(search);
            }
        },
        [onSearch],
    );

    return (
        <CommandPrimitive onKeyDown={handleKeyDown}>
            <div>
                <LocationInput
                    ref={inputRef}
                    value={inputValue}
                    onValueChange={handleInputChange}
                    onBlur={handleBlur}
                    onFocus={() => setOpen(true)}
                    placeholder={placeholder}
                    disabled={disabled}
                    isConfirmed={isLocationConfirmed}
                    className="text-base"
                />
            </div>
            <div className="relative mt-1">
                <div
                    className={cn(
                        "absolute top-0 z-10 w-full rounded-xl bg-white outline-none animate-in fade-in-0 zoom-in-95",
                        isOpen ? "block" : "hidden",
                    )}
                >
                    <CommandList className="rounded-lg ring-1 ring-slate-200">
                        {isLoading ? (
                            <CommandPrimitive.Loading>
                                <div className="p-1">
                                    <Skeleton className="h-8 w-full" />
                                </div>
                            </CommandPrimitive.Loading>
                        ) : null}
                        {options.length > 0 && !isLoading ? (
                            <CommandGroup>
                                {options.map((option) => {
                                    const isSelected = selected?.value === option.value;
                                    return (
                                        <CommandItem
                                            key={option.value}
                                            value={option.label}
                                            onMouseDown={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                            }}
                                            onSelect={() => handleSelectOption(option)}
                                            className={cn(
                                                "flex w-full items-center gap-2",
                                                !isSelected ? "pl-8" : null,
                                            )}
                                        >
                                            {isSelected ? <Check className="w-4" /> : null}
                                            {option.label}
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        ) : null}
                        {!isLoading ? (
                            <CommandPrimitive.Empty className="select-none rounded-sm px-2 py-3 text-center text-sm">
                                {emptyMessage}
                            </CommandPrimitive.Empty>
                        ) : null}
                    </CommandList>
                </div>
            </div>
        </CommandPrimitive>
    );
};
