"use client";

import React from "react";
import { Button } from "@/components/ui/button";

type FundingDemoButtonProps = {
    className?: string;
    size?: "default" | "sm" | "lg" | "icon";
};

export function FundingDemoButton({ className, size = "sm" }: FundingDemoButtonProps) {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const [showMessage, setShowMessage] = React.useState(false);

    React.useEffect(() => {
        if (!showMessage) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setShowMessage(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setShowMessage(false);
            }
        };

        const timeoutId = window.setTimeout(() => setShowMessage(false), 2400);

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleEscape);

        return () => {
            window.clearTimeout(timeoutId);
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [showMessage]);

    return (
        <div ref={containerRef} className="relative inline-flex flex-col items-end">
            <Button
                type="button"
                size={size}
                className={className}
                aria-expanded={showMessage}
                onClick={() => setShowMessage((current) => !current)}
            >
                Fund
            </Button>
            {showMessage ? (
                <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 shadow-lg">
                    Demo only. Payment not connected yet.
                </div>
            ) : null}
        </div>
    );
}
