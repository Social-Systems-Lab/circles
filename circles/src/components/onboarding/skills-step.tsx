"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import ItemCard from "./item-card";
import SelectedItemBadge from "./selected-item-badge";
import { OnboardingStepProps, OnboardingUserData } from "./onboarding";
import { skills } from "@/lib/data/constants";
import { fetchSkillsByProfile, saveSkillsAction } from "./actions";
import { Skill } from "@/models/models";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

function SkillsStep({ userData, setUserData, nextStep, prevStep }: OnboardingStepProps) {
    const [skillSearch, setSkillSearch] = useState("");
    const [allSkills, setAllSkills] = useState<Skill[]>([]);
    const [user, setUser] = useAtom(userAtom);

    const visibleSkills = useMemo(() => {
        if (skillSearch) {
            return allSkills.filter(
                (skill) =>
                    skill.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
                    skill.description.toLowerCase().includes(skillSearch.toLowerCase()),
            );
        } else {
            return allSkills;
        }
    }, [allSkills, skillSearch]);

    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        // Use startTransition to fetch skills based on mission statement
        startTransition(async () => {
            const response = await fetchSkillsByProfile(userData.mission);
            if (response.success) {
                setAllSkills(response.skills);
            } else {
                setAllSkills(skills);
                console.error(response.message);
            }
        });
    }, [userData.mission]);

    const handleSkillToggle = (skill: Skill) => {
        setUserData((prev: OnboardingUserData) => {
            const newSelectedSkills = prev.selectedSkills.some((c) => c.handle === skill.handle)
                ? prev.selectedSkills.filter((c) => c.handle !== skill.handle)
                : [...prev.selectedSkills, skill];

            return {
                ...prev,
                selectedSkills: newSelectedSkills,
            };
        });
    };

    const handleNext = async () => {
        startTransition(async () => {
            let selectedSkills = userData.selectedSkills.map((x) => x.handle);
            const response = await saveSkillsAction(selectedSkills, user?._id);
            if (!response.success) {
                // Handle error
                console.error(response.message);
            } else {
                // Update userAtom
                setUser((prev) => ({ ...prev, skills: selectedSkills }));
            }
            nextStep();
        });
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
                    value={skillSearch}
                    onChange={(e) => setSkillSearch(e.target.value)}
                    className="pl-10"
                />
            </div>
            <ScrollArea className="h-[360px] w-full rounded-md border-0">
                <div className="grid grid-cols-3 gap-4 p-[4px]">
                    {isPending && (!visibleSkills || visibleSkills.length <= 0) && (
                        <div className="col-span-3 flex items-center justify-center">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading skills...
                        </div>
                    )}

                    {visibleSkills.map((skill) => (
                        <ItemCard
                            key={skill.handle}
                            item={skill}
                            isSelected={userData.selectedSkills.some((c) => c.handle === skill.handle)}
                            onToggle={handleSkillToggle}
                        />
                    ))}
                </div>
            </ScrollArea>
            <div className="flex flex-wrap">
                {userData.selectedSkills.map((skill) => (
                    <SelectedItemBadge key={skill.handle} item={skill} onRemove={handleSkillToggle} />
                ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
                <Button onClick={prevStep} variant="outline" className=" rounded-full" disabled={isPending}>
                    Back
                </Button>
                <Button
                    onClick={handleNext}
                    disabled={userData.selectedSkills.length < 2 || isPending}
                    className="min-w-[100px] rounded-full"
                >
                    {isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>{userData.selectedSkills.length < 1 ? "Select at least 1 skill" : "Next"}</>
                    )}
                </Button>
            </div>
        </div>
    );
}

export default SkillsStep;

// "use client";

// import { useState, useEffect } from "react";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Search } from "lucide-react";
// import { ScrollArea } from "@/components/ui/scroll-area";
// import ItemCard from "./item-card";
// import SelectedItemBadge from "./selected-item-badge";
// import { OnboardingStepProps } from "./onboarding";
// import { skills } from "@/lib/data/constants";

// function SkillsStep({ userData, setUserData, nextStep, prevStep }: OnboardingStepProps) {
//     const [offerSearch, setOfferSearch] = useState("");
//     const [visibleOffers, setVisibleOffers] = useState(skills);

//     useEffect(() => {
//         if (offerSearch) {
//             setVisibleOffers(
//                 skills.filter(
//                     (offer) =>
//                         offer.name.toLowerCase().includes(offerSearch.toLowerCase()) ||
//                         offer.description.toLowerCase().includes(offerSearch.toLowerCase()),
//                 ),
//             );
//         } else {
//             setVisibleOffers(skills);
//         }
//     }, [offerSearch]);

//     const handleOfferToggle = (offer: Skill) => {
//         setUserData((prev) => {
//             const newSelectedOffers = prev.selectedOffers.some((o) => o.id === offer.id)
//                 ? prev.selectedOffers.filter((o) => o.id !== offer.id)
//                 : [...prev.selectedOffers, offer];

//             return {
//                 ...prev,
//                 selectedOffers: newSelectedOffers,
//             };
//         });
//     };

//     const handleNext = () => {
//         nextStep();
//     };

//     return (
//         <div className="space-y-4">
//             <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">Your Skills and Powers</h2>
//             <p className="text-gray-600">Choose the abilities you bring to your mission:</p>
//             <div className="relative">
//                 <Search className="absolute left-2 top-1/2 -translate-y-1/2 transform text-gray-400" />
//                 <Input
//                     type="text"
//                     placeholder="Search or describe what you can offer..."
//                     value={offerSearch}
//                     onChange={(e) => setOfferSearch(e.target.value)}
//                     className="pl-10"
//                 />
//             </div>
//             <ScrollArea className="h-[360px] w-full rounded-md border">
//                 <div className="grid grid-cols-3 gap-4 p-4">
//                     {visibleOffers.map((offer) => (
//                         <ItemCard
//                             key={offer.id}
//                             item={offer}
//                             isSelected={userData.selectedOffers.some((o) => o.id === offer.id)}
//                             onToggle={handleOfferToggle}
//                         />
//                     ))}
//                 </div>
//             </ScrollArea>
//             <div className="flex flex-wrap">
//                 {userData.selectedOffers.map((offer) => (
//                     <SelectedItemBadge key={offer.id} item={offer} onRemove={handleOfferToggle} />
//                 ))}
//             </div>
//             <p className="text-sm text-gray-500">
//                 Remember, all skills are valuable! From technical abilities to soft skills like communication or
//                 organization.
//             </p>
//             <div className="mt-4 flex items-center justify-between">
//                 <Button onClick={prevStep} variant="outline" className="rounded-full">
//                     Back
//                 </Button>
//                 <Button
//                     onClick={handleNext}
//                     disabled={userData.selectedOffers.length < 1}
//                     className="min-w-[100px] rounded-full"
//                 >
//                     {userData.selectedOffers.length < 1 ? "Select at least 1 skill" : "Next"}
//                 </Button>
//             </div>
//         </div>
//     );
// }

// export default SkillsStep;
