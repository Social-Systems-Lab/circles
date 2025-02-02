"use client";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { userSettingsAtom } from "@/lib/data/atoms";
import { TabOptions } from "@/models/models";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function CirclesTabs({ currentTab }: { currentTab?: string }) {
    const router = useRouter();
    const isCompact = useIsCompact();
    const [settings, setSettings] = useAtom(userSettingsAtom);

    const switchTab = (tab: TabOptions) => {
        router.push(`?tab=${tab}`);
        setSettings((x) => ({ ...x, circlesTab: tab }));
    };

    useEffect(() => {
        if (!currentTab) {
            router.replace(`?tab=${settings.feedTab}`);
        }
    }, [currentTab, router, setSettings, settings.feedTab]);

    return (
        <div className="flex w-full border-b">
            <button
                className={`flex-1 py-2 text-center ${
                    currentTab === "following" ? "border-b-2 border-blue-500 font-bold" : "text-gray-600"
                } hover:bg-gray-100`}
                onClick={() => switchTab("following")}
            >
                Following
            </button>
            <button
                className={`flex-1 py-2 text-center ${
                    currentTab === "discover" ? "border-b-2 border-blue-500 font-bold" : "text-gray-600"
                } hover:bg-gray-100`}
                onClick={() => switchTab("discover")}
            >
                Discover
            </button>
        </div>
    );
}
