"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import ItemCard from "./item-card";
import SelectedItemBadge from "./selected-item-badge";
import { OnboardingStepProps, Skill } from "./onboarding";
import { skills } from "@/lib/data/constants";

function SkillsStep({ userData, setUserData, nextStep, prevStep }: OnboardingStepProps) {
    const [offerSearch, setOfferSearch] = useState("");
    const [visibleOffers, setVisibleOffers] = useState(skills);

    useEffect(() => {
        if (offerSearch) {
            setVisibleOffers(
                skills.filter(
                    (offer) =>
                        offer.name.toLowerCase().includes(offerSearch.toLowerCase()) ||
                        offer.description.toLowerCase().includes(offerSearch.toLowerCase()),
                ),
            );
        } else {
            setVisibleOffers(skills);
        }
    }, [offerSearch]);

    const handleOfferToggle = (offer: Skill) => {
        setUserData((prev) => {
            const newSelectedOffers = prev.selectedOffers.some((o) => o.id === offer.id)
                ? prev.selectedOffers.filter((o) => o.id !== offer.id)
                : [...prev.selectedOffers, offer];

            return {
                ...prev,
                selectedOffers: newSelectedOffers,
            };
        });
    };

    const handleNext = () => {
        nextStep();
    };

    return (
        <div className="space-y-4">
            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">Your Skills and Powers</h2>
            <p className="text-gray-600">Choose the abilities you bring to your mission:</p>
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 transform text-gray-400" />
                <Input
                    type="text"
                    placeholder="Search or describe what you can offer..."
                    value={offerSearch}
                    onChange={(e) => setOfferSearch(e.target.value)}
                    className="pl-10"
                />
            </div>
            <ScrollArea className="h-[360px] w-full rounded-md border">
                <div className="grid grid-cols-3 gap-4 p-4">
                    {visibleOffers.map((offer) => (
                        <ItemCard
                            key={offer.id}
                            item={offer}
                            isSelected={userData.selectedOffers.some((o) => o.id === offer.id)}
                            onToggle={handleOfferToggle}
                        />
                    ))}
                </div>
            </ScrollArea>
            <div className="flex flex-wrap">
                {userData.selectedOffers.map((offer) => (
                    <SelectedItemBadge key={offer.id} item={offer} onRemove={handleOfferToggle} />
                ))}
            </div>
            <p className="text-sm text-gray-500">
                Remember, all skills are valuable! From technical abilities to soft skills like communication or
                organization.
            </p>
            <div className="mt-4 flex items-center justify-between">
                <Button onClick={prevStep} variant="outline" className="rounded-full">
                    Back
                </Button>
                <Button
                    onClick={handleNext}
                    disabled={userData.selectedOffers.length < 1}
                    className="min-w-[100px] rounded-full"
                >
                    {userData.selectedOffers.length < 1 ? "Select at least 1 skill" : "Next"}
                </Button>
            </div>
        </div>
    );
}

export default SkillsStep;
