"use client";

import React from "react";
import { Button } from "@/components/ui/button";

type FundingDemoButtonProps = {
    className?: string;
    size?: "default" | "sm" | "lg" | "icon";
};

export function FundingDemoButton({ className, size = "sm" }: FundingDemoButtonProps) {
    const [showMessage, setShowMessage] = React.useState(false);

    return (
        <div className="flex flex-col items-end gap-1">
            <Button
                type="button"
                size={size}
                className={className}
                onClick={() => setShowMessage(true)}
            >
                Fund
            </Button>
            {showMessage ? (
                <div className="text-right text-xs text-slate-500">
                    Demo only - payment flow not connected yet.
                </div>
            ) : null}
        </div>
    );
}
