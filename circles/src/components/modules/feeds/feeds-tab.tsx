"use client";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { userSettingsAtom } from "@/lib/data/atoms";
import { updateQueryParam } from "@/lib/utils/helpers-client";
import { TabOptions } from "@/models/models";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function FeedTabs({ currentTab }: { currentTab?: string }) {
    const router = useRouter();
    const isCompact = useIsCompact();
    const [settings, setSettings] = useAtom(userSettingsAtom);

    const switchTab = (tab: TabOptions) => {
        updateQueryParam(router, "tab", tab);
        setSettings((x) => ({ ...x, feedTab: tab }));
    };

    useEffect(() => {
        if (!currentTab) {
            updateQueryParam(router, "tab", settings.feedTab);
        }
    }, [currentTab, router, setSettings, settings.feedTab]);

    const containerMaxWidth = isCompact ? "none" : "760px";
    const baseButtonClasses =
        "rounded-t-lg px-6 py-2 text-sm font-semibold text-gray-600 transition-colors border-b-2 border-transparent focus:outline-none";

    return (
        <div className="mb-4 flex w-full justify-center border-b border-gray-200" style={{ maxWidth: containerMaxWidth }}>
            <div className="flex items-center justify-center gap-2">
                <button
                    className={`${baseButtonClasses} ${
                        currentTab === "following" ? "border-blue-500 text-blue-600" : "hover:text-gray-900"
                    }`}
                    onClick={() => switchTab("following")}
                >
                    Following
                </button>
                <button
                    className={`${baseButtonClasses} ${
                        currentTab === "discover" ? "border-blue-500 text-blue-600" : "hover:text-gray-900"
                    }`}
                    onClick={() => switchTab("discover")}
                >
                    Discover
                </button>
            </div>
        </div>
    );
}
