"use client";

import { useEffect, useState } from "react";

type LandingStat = {
    label: string;
    value: number;
    suffix?: string;
};

type LandingStatsProps = {
    stats: LandingStat[];
};

export default function LandingStats({ stats }: LandingStatsProps) {
    const [values, setValues] = useState<number[]>(() => stats.map(() => 0));

    useEffect(() => {
        const durationMs = 900;
        const start = window.performance.now();

        const step = (now: number) => {
            const progress = Math.min((now - start) / durationMs, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            setValues(stats.map((stat) => Math.round(stat.value * eased)));

            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };

        const frame = window.requestAnimationFrame(step);
        return () => window.cancelAnimationFrame(frame);
    }, [stats]);

    return (
        <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((stat, index) => (
                <div
                    key={stat.label}
                    className="rounded-[26px] border border-[#f0d78f] bg-[#fff8e7] px-6 py-7 text-center shadow-[0_16px_36px_rgba(92,67,18,0.08)]"
                >
                    <div className="text-4xl font-semibold tracking-tight text-kam-gray-dark sm:text-5xl">
                        {values[index]?.toLocaleString() ?? 0}
                        {stat.suffix ?? ""}
                    </div>
                    <p className="mt-2 text-sm uppercase tracking-[0.2em] text-kam-gray-dark/58">{stat.label}</p>
                </div>
            ))}
        </div>
    );
}
