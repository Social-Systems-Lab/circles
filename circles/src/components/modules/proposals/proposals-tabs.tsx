"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Circle, ProposalDisplay, ProposalStage } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";
import { getProposalsByCircleIdAction } from "@/app/circles/[handle]/proposals/actions"; // Assuming an action exists or will be created
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { features } from "@/lib/data/constants";
import { isAuthorized } from "@/lib/auth/client-auth";
import ProposalsList from "./proposals-list"; // We'll integrate this properly later

interface ProposalsTabsProps {
    circle: Circle;
    initialProposals: ProposalDisplay[]; // Added prop for initial data
}

type TabValue = "submitted" | "accepted" | "resolved";

const ProposalsTabs: React.FC<ProposalsTabsProps> = ({ circle, initialProposals }) => {
    const [user] = useAtom(userAtom);
    const router = useRouter();
    // Set initial loading state to false as data is passed via props
    const [isLoading, setIsLoading] = useState(false);
    // Initialize allProposals with initialProposals prop
    const [allProposals, setAllProposals] = useState<ProposalDisplay[]>(initialProposals || []);
    const [activeTab, setActiveTab] = useState<TabValue>("submitted");

    // useEffect to update proposals if initialProposals prop changes
    useEffect(() => {
        setAllProposals(initialProposals || []);
        setIsLoading(false); // Ensure loading is false when props are received/updated
    }, [initialProposals]);

    const filteredProposals = useMemo(() => {
        // No need to filter by activeTab here, as ProposalsList will receive the full list for that tab
        // The filtering logic is now per tab when rendering ProposalsList
        return allProposals;
    }, [allProposals]);

    return (
        <div className="flex w-full flex-col items-center">
            <div className="w-full max-w-[1100px] px-4 py-4">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)} className="w-full">
                    <div className="mb-4 flex items-center justify-between">
                        <TabsList className="bg-transparent p-0">
                            <TabsTrigger
                                value="submitted"
                                className="mr-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            >
                                Submitted
                            </TabsTrigger>
                            <TabsTrigger
                                value="accepted"
                                className="mr-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            >
                                Accepted
                            </TabsTrigger>
                            <TabsTrigger
                                value="resolved"
                                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            >
                                Resolved
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {isLoading ? (
                        <div className="flex h-64 items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            <TabsContent value="submitted" className="mt-0">
                                <ProposalsList
                                    circle={circle}
                                    proposals={filteredProposals.filter((p) =>
                                        ["draft", "review", "voting"].includes(p.stage),
                                    )}
                                />
                            </TabsContent>
                            <TabsContent value="accepted" className="mt-0">
                                <ProposalsList
                                    circle={circle}
                                    proposals={filteredProposals.filter((p) => p.stage === "accepted")}
                                />
                                {/* Ranking UI will go here */}
                            </TabsContent>
                            <TabsContent value="resolved" className="mt-0">
                                <ProposalsList
                                    circle={circle}
                                    proposals={filteredProposals.filter((p) =>
                                        ["implemented", "rejected"].includes(p.stage),
                                    )}
                                />
                            </TabsContent>
                        </>
                    )}
                </Tabs>
            </div>
        </div>
    );
};

export default ProposalsTabs;
