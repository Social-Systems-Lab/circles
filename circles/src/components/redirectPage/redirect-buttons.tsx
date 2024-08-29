"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

export interface ButtonConfig {
    text: string;
    href: string;
    variant?: "outline" | "default" | "destructive" | "secondary" | "ghost" | "link";
}

interface RedirectButtonsProps {
    buttons: ButtonConfig[];
}

export const RedirectButtonsLinks = ({ buttons }: RedirectButtonsProps) => {
    const searchParams = useSearchParams();
    const redirectTo = searchParams.get("redirectTo") ?? "/";

    return (
        <div className="mt-4 flex flex-row gap-2">
            {buttons.map((button, index) => (
                <Link key={index} href={button.href.replace("{redirectTo}", redirectTo)}>
                    <Button variant={button.variant || "outline"}>{button.text}</Button>
                </Link>
            ))}
        </div>
    );
};

export default function RedirectButtons({ buttons }: RedirectButtonsProps) {
    return (
        <Suspense>
            <RedirectButtonsLinks buttons={buttons} />
        </Suspense>
    );
}
