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

    const activeTab = (currentTab as TabOptions) || settings.feedTab;
    const containerMaxWidth = isCompact ? "none" : "760px";
    const tabs: { key: TabOptions; label: string }[] = [
        { key: "following", label: "Following" },
        { key: "discover", label: "Discover" },
    ];

    return (
        <div
            className="mb-6 flex w-full justify-center px-2 sm:px-4"
            style={{ maxWidth: containerMaxWidth, marginLeft: "auto", marginRight: "auto" }}
        >
            <div className="mx-auto flex w-full max-w-[540px] min-w-[320px] items-center justify-center gap-3 rounded-full bg-white/95 p-1.5 shadow-sm ring-1 ring-gray-200 backdrop-blur">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            className={`relative flex flex-1 items-center justify-center rounded-full px-6 py-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 ${
                                isActive
                                    ? "bg-blue-600 text-white shadow"
                                    : "text-gray-600 hover:text-gray-900"
                            }`}
                            onClick={() => switchTab(tab.key)}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
