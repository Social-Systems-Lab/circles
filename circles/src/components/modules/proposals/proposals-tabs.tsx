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
    // We might pass initial proposals if fetched server-side, or fetch client-side
    // initialProposals?: ProposalDisplay[];
}

type TabValue = "submitted" | "accepted" | "resolved";

const ProposalsTabs: React.FC<ProposalsTabsProps> = ({ circle }) => {
    const [user] = useAtom(userAtom);
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [allProposals, setAllProposals] = useState<ProposalDisplay[]>([]);
    const [activeTab, setActiveTab] = useState<TabValue>("submitted");

    const canCreateProposal = isAuthorized(user, circle, features.proposals.create);

    useEffect(() => {
        const fetchProposals = async () => {
            setIsLoading(true);
            try {
                // TODO: Replace with an actual action that fetches all proposals for the circle
                // For now, using a placeholder. This action should ideally be created.
                // const proposals = initialProposals || await getProposalsByCircleId(circle._id);
                // setAllProposals(proposals);

                // Placeholder: Simulate fetching. Replace with actual call to getProposalsByCircleIdAction
                // const result = await getProposalsByCircleIdAction(circle.handle!);
                // if (result.success && result.proposals) {
                //    setAllProposals(result.proposals);
                // } else {
                //    console.error("Failed to fetch proposals:", result.message);
                //    setAllProposals([]); // Set to empty array on failure
                // }
                // For now, we'll assume proposals will be passed to a modified ProposalsList
                // or fetched within ProposalsList instances per tab.
                // This top-level fetch might be redundant if each tab's list fetches its own.
                // For simplicity in this step, we'll manage a dummy list.
                // In a real scenario, you'd fetch all proposals here or have each
                // tab's component fetch its specific subset.
                console.warn("Placeholder: Proposal fetching logic needs to be implemented.");
                // Simulating a fetch delay and setting some dummy data for UI structure
                setTimeout(() => {
                    // Dummy data for now, replace with actual fetched data
                    // setAllProposals([]);
                    setIsLoading(false);
                }, 500);
            } catch (error) {
                console.error("Error fetching proposals:", error);
                setAllProposals([]); // Set to empty array on error
            } finally {
                // setIsLoading(false); // Moved to timeout for simulation
            }
        };

        fetchProposals();
    }, [circle.handle, circle._id]);

    const filteredProposals = useMemo(() => {
        switch (activeTab) {
            case "submitted":
                return allProposals.filter((p) => ["draft", "review", "voting"].includes(p.stage));
            case "accepted":
                return allProposals.filter((p) => p.stage === "accepted");
            case "resolved":
                return allProposals.filter((p) => ["implemented", "rejected"].includes(p.stage));
            default:
                return [];
        }
    }, [allProposals, activeTab]);

    const handleCreateProposal = () => {
        // For now, this will navigate to a generic create page or open a dialog
        // The existing ProposalsList has a dialog for creating a draft, which is good.
        // We might want to trigger that dialog from here or a dedicated create page.
        router.push(`/circles/${circle.handle}/proposals/create`); // Or open a dialog
    };

    // This component will be responsible for fetching ALL proposals for the circle,
    // and then passing filtered lists to instances of a modified `ProposalsList` component.
    // For now, each tab will just show a placeholder.

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

                        {canCreateProposal && (
                            <Button onClick={handleCreateProposal} size="sm">
                                <Plus className="mr-1.5 h-4 w-4" /> Create Proposal
                            </Button>
                        )}
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
