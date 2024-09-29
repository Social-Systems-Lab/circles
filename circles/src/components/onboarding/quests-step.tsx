"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import ItemCard from "./item-card";
import SelectedItemBadge from "./selected-item-badge";
import { OnboardingStepProps, Quest } from "./onboarding";

const allQuests: Quest[] = [
    {
        id: 1,
        name: "Eliminate Poverty",
        image: "/images/quests/poverty.png",
        description: "Work towards ending poverty in all its forms everywhere",
        metric: "Global poverty rate: 9.2% (2017)",
        goal: "Reduce to 3% by 2030",
        story: "In 2020, a community-led initiative in rural India helped 500 families start sustainable businesses, reducing local poverty by 15%.",
    },
    {
        id: 2,
        name: "Organize a Beach Cleanup Day",
        image: "/images/quests/beach.png",
        description: "Host a community event to clean up plastic waste from local beaches",
        metric: "Plastic collected: 500kg (2022)",
        goal: "Remove 2,000kg of plastic waste in a single event",
        story: "A coastal town brought together 300 volunteers who cleared 3,000kg of waste from their beaches, significantly reducing pollution in the area.",
    },
    {
        id: 3,
        name: "Plant 1,000 Trees in a Local Park",
        image: "/images/quests/plant.png",
        description: "Lead a tree-planting initiative in your local area to support reforestation efforts",
        metric: "Current forest cover in your area: 35%",
        goal: "Increase local tree cover by 10% by 2025",
        story: "A community-led effort planted 1,500 trees in a local park, increasing biodiversity and providing green spaces for residents.",
    },
    {
        id: 4,
        name: "Clean Energy Transition",
        image: "/images/quests/cleanenergy.png",
        description: "Accelerate the shift to renewable energy sources",
        metric: "Renewable energy share: 17.7% (2019)",
        goal: "Reach 50% by 2030",
        story: "A small town in Germany achieved 100% renewable energy status in 2020, inspiring neighboring communities to follow suit.",
    },
    {
        id: 5,
        name: "Quality Education",
        image: "/images/quests/education.png",
        description: "Ensure inclusive and equitable quality education for all",
        metric: "Out-of-school children: 59 million (2018)",
        goal: "Reduce to 0 by 2030",
        story: "An online education platform provided free access to 1 million students in underserved areas, improving test scores by 30%.",
    },
    {
        id: 6,
        name: "Gender Equality",
        image: "/images/quests/genderequality.png",
        description: "Achieve gender equality and empower all women and girls",
        metric: "Gender pay gap: 23% (2019)",
        goal: "Reduce to 0% by 2030",
        story: "A tech company's initiative to promote women in leadership roles increased female executives from 15% to 45% in just two years.",
    },
    {
        id: 7,
        name: "Reforestation",
        image: "/images/quests/reforestation.png",
        description: "Restore forests and combat desertification",
        metric: "Forest area: 4.06 billion hectares (2020)",
        goal: "Increase by 3% by 2030",
        story: "A community reforestation project in Brazil planted 2 million trees in 2021, creating a wildlife corridor between two fragmented forests.",
    },
];

function QuestsStep({ userData, setUserData, nextStep, prevStep }: OnboardingStepProps) {
    const [questSearch, setQuestSearch] = useState("");
    const [visibleQuests, setVisibleQuests] = useState(allQuests.slice(0, 6));

    useEffect(() => {
        if (questSearch) {
            setVisibleQuests(
                allQuests.filter(
                    (quest) =>
                        quest.name.toLowerCase().includes(questSearch.toLowerCase()) ||
                        quest.description.toLowerCase().includes(questSearch.toLowerCase()),
                ),
            );
        } else {
            setVisibleQuests(allQuests.slice(0, 6));
        }
    }, [questSearch]);

    const handleQuestToggle = (quest: Quest) => {
        setUserData((prev) => {
            const newSelectedQuests = prev.selectedQuests.some((q) => q.id === quest.id)
                ? prev.selectedQuests.filter((q) => q.id !== quest.id)
                : [...prev.selectedQuests, quest];

            return {
                ...prev,
                selectedQuests: newSelectedQuests,
            };
        });
    };

    const handleNext = () => {
        nextStep();
    };

    return (
        <div className="space-y-4">
            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">Embark on Quests</h2>
            <p className="text-gray-600">Choose the quests you want to undertake:</p>
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 transform text-gray-400" />
                <Input
                    type="text"
                    placeholder="Search for quests..."
                    value={questSearch}
                    onChange={(e) => setQuestSearch(e.target.value)}
                    className="pl-10"
                />
            </div>
            <ScrollArea className="h-[360px] w-full rounded-md border">
                <div className="grid grid-cols-3 gap-4 p-4">
                    {visibleQuests.map((quest) => (
                        <ItemCard
                            key={quest.id}
                            item={quest}
                            isSelected={userData.selectedQuests.some((q) => q.id === quest.id)}
                            onToggle={handleQuestToggle}
                        />
                    ))}
                </div>
            </ScrollArea>
            <div className="flex flex-wrap">
                {userData.selectedQuests.map((quest) => (
                    <SelectedItemBadge key={quest.id} item={quest} onRemove={handleQuestToggle} />
                ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
                <Button onClick={prevStep} variant="outline" className="rounded-full">
                    Back
                </Button>
                <Button
                    onClick={handleNext}
                    disabled={userData.selectedQuests.length < 1}
                    className="min-w-[100px] rounded-full"
                >
                    {userData.selectedQuests.length < 1 ? "Select at least 1 quest" : "Next"}
                </Button>
            </div>
        </div>
    );
}

export default QuestsStep;
