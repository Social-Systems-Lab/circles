"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Globe, Search, X, Quote } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Image from "next/image";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { Textarea } from "../ui/textarea";
import { PiQuotesFill } from "react-icons/pi";
import { FaQuoteRight } from "react-icons/fa6";

type Cause = {
    handle: string;
    name: string;
    picture: string;
    description: string;
};

const allCauses: Cause[] = [
    {
        handle: "climate-action",
        name: "Climate Action",
        picture: "/images/causes/climate-action.png",
        description: "Working together to combat climate change and secure a sustainable future for all.",
    },
    {
        handle: "renewable-energy",
        name: "Renewable Energy",
        picture: "/images/causes/renewable-energy.png",
        description: "Advocating for clean, sustainable energy solutions to power our world.",
    },
    {
        handle: "wildlife-protection",
        name: "Wildlife Protection",
        picture: "/images/causes/wildlife-protection.png",
        description: "Safeguarding Earth's diverse species for a thriving planet.",
    },
    {
        handle: "healthy-oceans",
        name: "Healthy Oceans",
        picture: "/images/causes/healthy-oceans.png",
        description: "Preserving our oceans for the well-being of marine life and future generations.",
    },
    {
        handle: "sustainable-forestry",
        name: "Sustainable Forestry",
        picture: "/images/causes/sustainable-forestry.png",
        description: "Promoting responsible forest management to sustain ecosystems and communities.",
    },
    {
        handle: "sustainable-cities",
        name: "Sustainable Cities",
        picture: "/images/causes/sustainable-cities.png",
        description: "Building eco-friendly and resilient urban spaces for a better tomorrow.",
    },
    {
        handle: "no-poverty",
        name: "No Poverty",
        picture: "/images/causes/no-poverty.png",
        description: "Eliminate poverty in all its forms everywhere.",
    },
    {
        handle: "quality-education",
        name: "Quality Education",
        picture: "/images/causes/quality-education.png",
        description: "Ensuring inclusive and equitable education for all.",
    },
    {
        handle: "global-health",
        name: "Global Health & Well-being",
        picture: "/images/causes/global-health.png",
        description: "Promoting health and well-being worldwide for a brighter future.",
    },
    {
        handle: "gender-equality",
        name: "Gender Equality",
        picture: "/images/causes/gender-equality.png",
        description: "Advocating for equal rights and opportunities for all genders.",
    },
    {
        handle: "human-rights",
        name: "Human Rights",
        picture: "/images/causes/human-rights.png",
        description: "Upholding the fundamental rights and dignities of all people.",
    },
    {
        handle: "asylum-rights",
        name: "Asylum Rights",
        picture: "/images/causes/asylum-rights.png",
        description: "Protecting the rights of refugees and displaced persons seeking safety.",
    },
    {
        handle: "democracy",
        name: "Democracy",
        picture: "/images/causes/democracy.png",
        description: "Supporting fair, transparent, and representative governance.",
    },
    {
        handle: "social-justice",
        name: "Social Justice",
        picture: "/images/causes/social-justice.png",
        description: "Advocating for equality, fairness, and rights for all individuals.",
    },
    {
        handle: "security",
        name: "Security & Protection",
        picture: "/images/causes/security.png",
        description: "Ensuring safety and protection for all members of society.",
    },
    {
        handle: "peace",
        name: "Peace & Global Unity",
        picture: "/images/causes/peace.png",
        description: "Fostering harmony and cooperation among all nations.",
    },
    {
        handle: "indigenous-rights",
        name: "Indigenous Peoples' Rights",
        picture: "/images/causes/indigenous-rights.png",
        description: "Upholding the rights and cultures of Indigenous communities worldwide.",
    },
    {
        handle: "arts-and-culture",
        name: "Arts & Culture",
        picture: "/images/causes/arts-and-culture.png",
        description: "Celebrating and preserving the diverse expressions of human creativity.",
    },
    {
        handle: "humanitarian-aid",
        name: "Humanitarian Aid",
        picture: "/images/causes/humanitarian-aid.png",
        description: "Providing relief and support to those in crisis around the world.",
    },
    {
        handle: "animal-rights",
        name: "Animal Rights",
        picture: "/images/causes/animal-rights.png",
        description: "Ensuring the ethical treatment and protection of all animals.",
    },
    {
        handle: "freedom-of-press",
        name: "Freedom of the Press",
        picture: "/images/causes/freedom-of-press.png",
        description: "Supporting a free and independent media worldwide.",
    },
    {
        handle: "access-to-justice",
        name: "Access to Justice",
        picture: "/images/causes/access-to-justice.png",
        description: "Ensuring fair legal processes and equal access to justice for all.",
    },
    {
        handle: "lgbtq-rights",
        name: "LGBTQ+ Rights",
        picture: "/images/causes/lgbtq-rights.png",
        description: "Advocating for equal rights and acceptance of LGBTQ+ individuals.",
    },
    {
        handle: "digital-rights",
        name: "Digital Rights & Privacy",
        picture: "/images/causes/digital-rights.png",
        description: "Ensuring the protection of individual freedoms and privacy in the digital age.",
    },
    {
        handle: "civic-engagement",
        name: "Civic Engagement",
        picture: "/images/causes/civic-engagement.png",
        description: "Empowering citizens to actively participate in shaping their communities and governments.",
    },
    {
        handle: "disability-rights",
        name: "Disability Rights",
        picture: "/images/causes/disability-rights.png",
        description: "Promoting equal rights and opportunities for individuals with disabilities.",
    },
    {
        handle: "child-rights",
        name: "Child Rights",
        picture: "/images/causes/child-rights.png",
        description: "Protecting and promoting the rights and well-being of children worldwide.",
    },
    {
        handle: "elderly-care",
        name: "Elderly Care",
        picture: "/images/causes/elderly-care.png",
        description: "Ensuring dignity, care, and support for elderly individuals in our communities.",
    },
    {
        handle: "food-security",
        name: "Food Security",
        picture: "/images/causes/food-security.png",
        description: "Working to ensure all individuals have access to safe, nutritious food.",
    },
    {
        handle: "water-sanitation",
        name: "Water & Sanitation",
        picture: "/images/causes/water-sanitation.png",
        description: "Promoting access to clean water and sanitation for all communities.",
    },
    {
        handle: "housing-rights",
        name: "Housing Rights",
        picture: "/images/causes/housing-rights.png",
        description: "Advocating for safe, affordable, and adequate housing for all individuals.",
    },
];

const allOffers = [
    {
        id: 1,
        name: "Mentorship",
        image: "/images/skills/mentorship.png",
        description: "Share knowledge and guide others in their journey",
    },
    {
        id: 2,
        name: "Skill Sharing",
        image: "/images/skills/teaching.png",
        description: "Teach practical skills to empower others in their projects",
    },
    {
        id: 3,
        name: "Fundraising",
        image: "/images/skills/fundraising.png",
        description: "Help raise funds for important causes and initiatives",
    },
    {
        id: 4,
        name: "Event Organization",
        image: "/images/skills/eventorganizing.png",
        description: "Plan and execute impactful events for the community",
    },
    {
        id: 5,
        name: "Content Creation",
        image: "/images/skills/contentcreation.png",
        description: "Produce engaging content to spread awareness for causes",
    },
    {
        id: 6,
        name: "Campaigning",
        image: "/images/skills/campaigning.png",
        description: "Produce engaging content to spread awareness for causes",
    },
    {
        id: 7,
        name: "Networking",
        image: "/images/skills/networking.png",
        description: "Produce engaging content to spread awareness for causes",
    },
];

const allQuests = [
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

export default function Onboarding() {
    const [isOpen, setIsOpen] = useState(false);
    const [user] = useAtom(userAtom);
    const [step, setStep] = useState(1);
    const [userData, setUserData] = useState({
        name: "John Doe",
        dream: "",
        selectedCauses: [],
        selectedOffers: [],
        selectedQuests: [],
        avatar: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/default-user-picture-M9dFrPxE2sdnF7F6tqHabIV6yXlS0B.png",
        level: 1,
        xp: 10,
        badges: [],
    });
    const [causeSearch, setCauseSearch] = useState("");
    const [offerSearch, setOfferSearch] = useState("");
    const [questSearch, setQuestSearch] = useState("");
    const [visibleCauses, setVisibleCauses] = useState(allCauses);
    const [visibleOffers, setVisibleOffers] = useState(allOffers.slice(0, 6));
    const [visibleQuests, setVisibleQuests] = useState(allQuests.slice(0, 6));

    const totalSteps = 6;

    useEffect(() => {
        if (causeSearch) {
            setVisibleCauses(
                allCauses.filter(
                    (cause) =>
                        cause.name.toLowerCase().includes(causeSearch.toLowerCase()) ||
                        cause.description.toLowerCase().includes(causeSearch.toLowerCase()),
                ),
            );
        } else {
            setVisibleCauses(allCauses);
        }
    }, [causeSearch]);

    useEffect(() => {
        if (offerSearch) {
            setVisibleOffers(
                allOffers.filter(
                    (offer) =>
                        offer.name.toLowerCase().includes(offerSearch.toLowerCase()) ||
                        offer.description.toLowerCase().includes(offerSearch.toLowerCase()),
                ),
            );
        } else {
            setVisibleOffers(allOffers.slice(0, 6));
        }
    }, [offerSearch]);

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

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setUserData((prev) => ({ ...prev, [name]: value }));
    };

    const handleCauseToggle = (cause: { id: any }) => {
        setUserData((prev) => {
            const newSelectedCauses = prev.selectedCauses.some((c) => c.handle === cause.handle)
                ? prev.selectedCauses.filter((c) => c.handle !== cause.handle)
                : [...prev.selectedCauses, cause];

            return {
                ...prev,
                selectedCauses: newSelectedCauses,
            };
        });
    };

    const handleOfferToggle = (offer) => {
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

    const handleQuestToggle = (quest) => {
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

    const nextStep = () => {
        setStep((prev) => Math.min(prev + 1, totalSteps));

        if (step === totalSteps) {
            setIsOpen(false);
        }
    };
    const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

    const ItemCard = ({ item, isSelected, onToggle }) => (
        <Card
            className={`cursor-pointer border-0 shadow-lg transition-all ${isSelected ? "ring ring-[#66a5ff]" : ""}`}
            onClick={() => onToggle(item)}
        >
            <CardContent className="relative flex flex-col items-center p-2 text-center">
                {item.picture && (
                    <Image src={item.picture} alt={item.name} width={80} height={80} className="mb-2 rounded-full" />
                )}
                <h3 className="mb-0 mt-0  text-sm font-semibold">{item.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">{item.description}</p>
                {item.metric && <p className="mt-1 text-xs text-blue-600">{item.metric}</p>}
                {item.goal && <p className="mt-1 text-xs text-green-600">{item.goal}</p>}
                {item.champions && (
                    <Badge variant="secondary" className="mt-1">
                        {item.champions.toLocaleString()} champions
                    </Badge>
                )}
                {item.story && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="absolute right-2 top-2 flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-blue-500">
                                    <span className="text-xs font-bold text-white">i</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-xs">{item.story}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </CardContent>
        </Card>
    );

    const SelectedItemBadge = ({ item, onRemove }) => (
        <Badge variant="secondary" className="m-1 p-2">
            {item.name}
            <Button variant="ghost" size="sm" className="ml-2 p-0" onClick={() => onRemove(item)}>
                <X className="h-4 w-4" />
            </Button>
        </Badge>
    );

    const ProfileSummary = () => {
        return (
            <div className="w-64 rounded-[15px] bg-white/90 p-4 backdrop-blur-sm">
                <div className="space-y-4">
                    <div className="relative flex flex-col items-center">
                        <div className="relative">
                            <Image
                                src={user?.picture?.url ?? "/images/default-user-picture.png"}
                                alt="ProfilePicture"
                                width={80}
                                height={80}
                                className="rounded-full object-cover"
                            />
                            {/* <Avatar className="h-20 w-20">
                                <AvatarImage src={user?.picture?.url} />
                                <AvatarFallback>{user?.name?.charAt(0) || "J"}</AvatarFallback>
                            </Avatar> */}
                        </div>
                        <div className="mt-2 text-[18px] font-semibold">{user?.name}</div>
                        <p className="text-sm text-gray-500">Aspiring Changemaker</p>
                    </div>
                    {userData.dream && (
                        <div>
                            <div className="mb-0 mt-0 font-semibold">Mission</div>
                            <p className="text-sm text-gray-600">{userData.dream}</p>
                        </div>
                    )}
                    {userData.selectedCauses.length > 0 && (
                        <div>
                            <div className="mb-0 mt-0 font-semibold">Causes</div>
                            <div className="flex flex-wrap gap-1">
                                {userData.selectedCauses.map((cause) => (
                                    <Badge key={cause.id} variant="secondary">
                                        {cause.name}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                    {userData.selectedQuests.length > 0 && (
                        <div>
                            <div className="mb-0 mt-0 font-semibold">Active Quests</div>
                            <div className="flex flex-wrap gap-1">
                                {userData.selectedQuests.map((quest) => (
                                    <Badge key={quest.id} variant="secondary">
                                        {quest.name}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                    {userData.selectedOffers.length > 0 && (
                        <div>
                            <div className="mb-0 mt-0 font-semibold">Skills</div>
                            <div className="flex flex-wrap gap-1">
                                {userData.selectedOffers.map((offer) => (
                                    <Badge key={offer.id} variant="secondary">
                                        {offer.name}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (!isOpen) {
        return (
            <div
                className="absolute right-0 top-0 z-[500] h-[30px] w-[30px] cursor-pointer"
                onClick={() => setIsOpen(true)}
            ></div>
        );
    }

    return (
        <div className="fixed z-[500] flex h-screen w-screen items-center justify-center bg-gradient-to-br from-[#dce5ffcf] to-[#e3eaffcf] p-4">
            <div
                className="absolute right-0 top-0 z-[600] h-[100px] w-[100px] cursor-pointer"
                onClick={() => setIsOpen(false)}
            ></div>

            <Card className="w-full max-w-5xl overflow-hidden rounded-2xl border-0 bg-[#f9f9f9] shadow-xl backdrop-blur-sm">
                <CardContent className="p-6">
                    <div className="flex gap-6">
                        <ProfileSummary />
                        <div className="flex-1">
                            <Progress value={(step / totalSteps) * 100} className="mb-6" />
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={step}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    {step === 1 && (
                                        <div className="flex h-[500px] flex-col justify-center space-y-4 text-center">
                                            <h2 className="mb-0 mt-0 text-3xl font-bold text-gray-800">
                                                Welcome to Circles
                                            </h2>
                                            <p className="text-lg text-gray-600">
                                                Join a community of changemakers and embark on a journey to create
                                                positive impact. Are you ready to play for a better world?
                                            </p>
                                            <Button onClick={nextStep} className="mx-auto mt-4 rounded-full">
                                                Start Your Adventure
                                            </Button>
                                        </div>
                                    )}

                                    {step === 2 && (
                                        <div className="space-y-4">
                                            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">
                                                Your Mission
                                            </h2>
                                            <p className="text-gray-600">
                                                Define your purpose and the change you want to see in the world.
                                            </p>
                                            <Card className="relative mb-4 bg-gray-100 p-4">
                                                <div className="relative mx-auto flex flex-row items-center justify-center gap-2">
                                                    <FaQuoteRight size="28px" className="mb-2 text-blue-500" />
                                                </div>

                                                <p className="mb-2 text-sm italic text-gray-800">
                                                    My mission is to create a world where every child has access to
                                                    quality education, regardless of their background. I believe that by
                                                    empowering young minds, we can solve the world&apos;s most pressing
                                                    challenges and create a brighter future for all.
                                                </p>

                                                <div className="absolute bottom-0 right-0 flex flex-row items-center justify-center gap-2 p-2 pr-4">
                                                    <Avatar className="h-[28px] w-[28px]">
                                                        <AvatarImage src="https://i.pravatar.cc/28" alt="Alex Lee" />
                                                        <AvatarFallback>AL</AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-sm font-medium">Alex Lee</span>
                                                </div>
                                            </Card>
                                            <div className="space-y-2">
                                                <Label htmlFor="dream">What is your mission in this world?</Label>
                                                <Textarea
                                                    id="dream"
                                                    name="dream"
                                                    value={userData.dream}
                                                    onChange={handleInputChange}
                                                    placeholder="Share your vision for a better world"
                                                    className="h-32"
                                                />
                                            </div>
                                            <p className="text-sm text-gray-500">
                                                Remember, all information provided during this onboarding process can be
                                                changed later.
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <Button onClick={prevStep} variant="outline" className="rounded-full">
                                                    Back
                                                </Button>
                                                <Button onClick={nextStep} className="w-[100px] rounded-full">
                                                    Next
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {step === 3 && (
                                        <div className="space-y-4">
                                            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">
                                                Choose Your Causes
                                            </h2>
                                            <p className="text-gray-600">
                                                Select at least two causes that align with your mission:
                                            </p>
                                            <div className="relative">
                                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 transform text-gray-400" />
                                                <Input
                                                    type="text"
                                                    placeholder="Search or describe the causes you're passionate about..."
                                                    value={causeSearch}
                                                    onChange={(e) => setCauseSearch(e.target.value)}
                                                    className="pl-10"
                                                />
                                            </div>
                                            <ScrollArea className="h-[360px] w-full rounded-md border">
                                                <div className="grid grid-cols-3 gap-4 p-4">
                                                    {visibleCauses.map((cause) => (
                                                        <ItemCard
                                                            key={cause.handle}
                                                            item={cause}
                                                            isSelected={userData.selectedCauses.some(
                                                                (c) => c.handle === cause.handle,
                                                            )}
                                                            onToggle={handleCauseToggle}
                                                        />
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                            <div className="flex flex-wrap">
                                                {userData.selectedCauses.map((cause) => (
                                                    <SelectedItemBadge
                                                        key={cause.handle}
                                                        item={cause}
                                                        onRemove={handleCauseToggle}
                                                    />
                                                ))}
                                            </div>
                                            <div className="mt-4 flex items-center justify-between">
                                                <Button onClick={prevStep} variant="outline" className=" rounded-full">
                                                    Back
                                                </Button>
                                                <Button
                                                    onClick={nextStep}
                                                    disabled={userData.selectedCauses.length < 2}
                                                    className="min-w-[100px] rounded-full"
                                                >
                                                    {userData.selectedCauses.length < 2
                                                        ? "Select at least 2 causes"
                                                        : "Next"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {step === 4 && (
                                        <div className="space-y-4">
                                            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">
                                                Your Skills and Powers
                                            </h2>
                                            <p className="text-gray-600">
                                                Choose the abilities you bring to your quests:
                                            </p>
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
                                                            isSelected={userData.selectedOffers.some(
                                                                (o) => o.id === offer.id,
                                                            )}
                                                            onToggle={handleOfferToggle}
                                                        />
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                            <div className="flex flex-wrap">
                                                {userData.selectedOffers.map((offer) => (
                                                    <SelectedItemBadge
                                                        key={offer.id}
                                                        item={offer}
                                                        onRemove={handleOfferToggle}
                                                    />
                                                ))}
                                            </div>
                                            <p className="text-sm text-gray-500">
                                                Remember, all skills are valuable! From technical abilities to soft
                                                skills like communication or organization.
                                            </p>
                                            <div className="mt-4 flex items-center justify-between">
                                                <Button onClick={prevStep} variant="outline" className="rounded-full">
                                                    Back
                                                </Button>
                                                <Button
                                                    onClick={nextStep}
                                                    disabled={userData.selectedOffers.length < 1}
                                                    className="min-w-[100px] rounded-full"
                                                >
                                                    {userData.selectedOffers.length < 1
                                                        ? "Select at least 1 skill"
                                                        : "Next"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {step === 5 && (
                                        <div className="space-y-4">
                                            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">
                                                Embark on Quests
                                            </h2>
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
                                                            isSelected={userData.selectedQuests.some(
                                                                (q) => q.id === quest.id,
                                                            )}
                                                            onToggle={handleQuestToggle}
                                                        />
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                            <div className="flex flex-wrap">
                                                {userData.selectedQuests.map((quest) => (
                                                    <SelectedItemBadge
                                                        key={quest.id}
                                                        item={quest}
                                                        onRemove={handleQuestToggle}
                                                    />
                                                ))}
                                            </div>
                                            <div className="mt-4 flex items-center justify-between">
                                                <Button onClick={prevStep} variant="outline" className="rounded-full">
                                                    Back
                                                </Button>
                                                <Button
                                                    onClick={nextStep}
                                                    disabled={userData.selectedQuests.length < 1}
                                                    className="min-w-[100px] rounded-full"
                                                >
                                                    {userData.selectedQuests.length < 1
                                                        ? "Select at least 1 quest"
                                                        : "Next"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {step === 6 && (
                                        <div className="space-y-4">
                                            <div className="relative">
                                                <div className="h-[200px] w-full">
                                                    <Image
                                                        src="/images/cover3.png"
                                                        alt="Global community"
                                                        className="mx-auto rounded-lg object-cover"
                                                        fill
                                                    />
                                                </div>
                                                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black bg-opacity-50">
                                                    <div className="max-w-[350px] rounded-lg bg-white p-4 text-center">
                                                        <PiQuotesFill className="mx-auto mb-2 text-blue-500" />
                                                        <p className="mb-2 text-sm italic text-gray-800">
                                                            &quot;Circles has helped me level up my impact! I&apos;ve
                                                            connected with amazing people and we&apos;re tackling ocean
                                                            cleanup together.&quot;
                                                        </p>
                                                        <div className="flex items-center justify-center space-x-2">
                                                            <Avatar>
                                                                <AvatarImage
                                                                    src="https://i.pravatar.cc/28"
                                                                    alt="Joe Doe"
                                                                />
                                                                <AvatarFallback>JD</AvatarFallback>
                                                            </Avatar>
                                                            <span className="text-sm font-medium">Joe Doe</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">
                                                Welcome, Changemaker!
                                            </h2>
                                            <p className="text-gray-600">
                                                Your journey in Circles begins now. Here&apos;s a glimpse of the world
                                                you&apos;re about to enter:
                                            </p>
                                            <div className="grid grid-cols-2 gap-4">
                                                <Card className="bg-white p-4">
                                                    <h3 className="mb-0 mt-0 text-lg font-semibold">5000+</h3>
                                                    <p className="text-sm text-gray-500">Fellow changemakers</p>
                                                </Card>
                                                <Card className="bg-white p-4">
                                                    <h3 className="mb-0 mt-0  text-lg font-semibold">50+</h3>
                                                    <p className="text-sm text-gray-500">Active quests</p>
                                                </Card>
                                                <Card className="bg-white p-4">
                                                    <h3 className="mb-0 mt-0  text-lg font-semibold">50+</h3>
                                                    <p className="text-sm text-gray-500">Countries represented</p>
                                                </Card>
                                                <Card className="bg-white p-4">
                                                    <h3 className="mb-0 mt-0  text-lg font-semibold">100+</h3>
                                                    <p className="text-sm text-gray-500">Circles to join</p>
                                                </Card>
                                            </div>
                                            <p className="text-gray-600">
                                                Get ready to connect with allies, join guilds, and embark on
                                                world-changing quests!
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Remember, you&apos;re part of a supportive community. Don&apos;t
                                                hesitate to reach out, collaborate, and make a difference together!
                                            </p>
                                            <div className="mt-4 flex items-center justify-center">
                                                <Button
                                                    onClick={() => setIsOpen(false)}
                                                    className="mx-auto rounded-full"
                                                >
                                                    Begin Your Adventure
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
