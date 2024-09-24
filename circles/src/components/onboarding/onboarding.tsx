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

const allCauses = [
    {
        id: 1,
        name: "Climate Action",
        image: "/placeholder.svg?height=80&width=80",
        description: "Combat climate change and its impacts",
        champions: 4302,
    },
    {
        id: 2,
        name: "Social Justice",
        image: "/placeholder.svg?height=80&width=80",
        description: "Promote equality and fairness for all",
        champions: 3891,
    },
    {
        id: 3,
        name: "Education for All",
        image: "/placeholder.svg?height=80&width=80",
        description: "Ensure inclusive and quality education",
        champions: 4156,
    },
    {
        id: 4,
        name: "Mental Health Awareness",
        image: "/placeholder.svg?height=80&width=80",
        description: "Promote mental health and well-being",
        champions: 3578,
    },
    {
        id: 5,
        name: "Sustainable Cities",
        image: "/placeholder.svg?height=80&width=80",
        description: "Create inclusive, safe, and sustainable urban areas",
        champions: 2945,
    },
    {
        id: 6,
        name: "Ocean Cleanup",
        image: "/placeholder.svg?height=80&width=80",
        description: "Conserve and sustainably use marine resources",
        champions: 3201,
    },
];

const allOffers = [
    {
        id: 1,
        name: "Mentorship",
        image: "/placeholder.svg?height=80&width=80",
        description: "Share knowledge and guide others in their journey",
    },
    {
        id: 2,
        name: "Skill Sharing",
        image: "/placeholder.svg?height=80&width=80",
        description: "Teach practical skills to empower others in their projects",
    },
    {
        id: 3,
        name: "Fundraising",
        image: "/placeholder.svg?height=80&width=80",
        description: "Help raise funds for important causes and initiatives",
    },
    {
        id: 4,
        name: "Event Organization",
        image: "/placeholder.svg?height=80&width=80",
        description: "Plan and execute impactful events for the community",
    },
    {
        id: 5,
        name: "Content Creation",
        image: "/placeholder.svg?height=80&width=80",
        description: "Produce engaging content to spread awareness for causes",
    },
];

const allQuests = [
    {
        id: 1,
        name: "Eliminate Poverty",
        image: "/placeholder.svg?height=80&width=80",
        description: "Work towards ending poverty in all its forms everywhere",
        metric: "Global poverty rate: 9.2% (2017)",
        goal: "Reduce to 3% by 2030",
        story: "In 2020, a community-led initiative in rural India helped 500 families start sustainable businesses, reducing local poverty by 15%.",
    },
    {
        id: 2,
        name: "Clean Energy Transition",
        image: "/placeholder.svg?height=80&width=80",
        description: "Accelerate the shift to renewable energy sources",
        metric: "Renewable energy share: 17.7% (2019)",
        goal: "Reach 50% by 2030",
        story: "A small town in Germany achieved 100% renewable energy status in 2020, inspiring neighboring communities to follow suit.",
    },
    {
        id: 3,
        name: "Quality Education",
        image: "/placeholder.svg?height=80&width=80",
        description: "Ensure inclusive and equitable quality education for all",
        metric: "Out-of-school children: 59 million (2018)",
        goal: "Reduce to 0 by 2030",
        story: "An online education platform provided free access to 1 million students in underserved areas, improving test scores by 30%.",
    },
    {
        id: 4,
        name: "Gender Equality",
        image: "/placeholder.svg?height=80&width=80",
        description: "Achieve gender equality and empower all women and girls",
        metric: "Gender pay gap: 23% (2019)",
        goal: "Reduce to 0% by 2030",
        story: "A tech company's initiative to promote women in leadership roles increased female executives from 15% to 45% in just two years.",
    },
    {
        id: 5,
        name: "Clean Oceans",
        image: "/placeholder.svg?height=80&width=80",
        description: "Reduce marine pollution and protect ocean ecosystems",
        metric: "Plastic in oceans: 8 million tons/year (2010)",
        goal: "Reduce by 90% by 2030",
        story: "A volunteer-led beach cleanup initiative removed 500,000 kg of plastic from coastlines across 50 countries in a single day.",
    },
    {
        id: 6,
        name: "Reforestation",
        image: "/placeholder.svg?height=80&width=80",
        description: "Restore forests and combat desertification",
        metric: "Forest area: 4.06 billion hectares (2020)",
        goal: "Increase by 3% by 2030",
        story: "A community reforestation project in Brazil planted 2 million trees in 2021, creating a wildlife corridor between two fragmented forests.",
    },
];

export default function Component() {
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
    const [visibleCauses, setVisibleCauses] = useState(allCauses.slice(0, 6));
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
            setVisibleCauses(allCauses.slice(0, 6));
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

    const handleCauseToggle = (cause) => {
        setUserData((prev) => {
            const newSelectedCauses = prev.selectedCauses.some((c) => c.id === cause.id)
                ? prev.selectedCauses.filter((c) => c.id !== cause.id)
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
    };
    const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

    const ItemCard = ({ item, isSelected, onToggle }) => (
        <Card
            className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => onToggle(item)}
        >
            <CardContent className="relative flex flex-col items-center p-2 text-center">
                {item.image && (
                    <Image src={item.image} alt={item.name} width={80} height={80} className="mb-2 rounded-full" />
                )}
                <h3 className="text-sm font-semibold">{item.name}</h3>
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
            <div className="w-64 bg-white/90 p-4 backdrop-blur-sm">
                <div className="space-y-4">
                    <div className="relative flex flex-col items-center">
                        <div className="relative">
                            <Avatar className="h-20 w-20">
                                <AvatarImage src={userData.avatar} />
                                <AvatarFallback>{userData.name?.charAt(0) || "J"}</AvatarFallback>
                            </Avatar>
                            <div className="absolute bottom-0 right-0 h-6 w-6">
                                <svg viewBox="0 0 100 100" className="h-full w-full">
                                    <circle cx="50" cy="50" r="45" fill="#3b82f6" stroke="#e5e7eb" strokeWidth="10" />
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="45"
                                        fill="none"
                                        stroke="#1d4ed8"
                                        strokeWidth="10"
                                        strokeDasharray={`${userData.xp * 2.83} 283`}
                                        transform="rotate(-90 50 50)"
                                    />
                                    <text
                                        x="50"
                                        y="50"
                                        textAnchor="middle"
                                        dy=".3em"
                                        className="fill-white text-[10px] font-bold"
                                    >
                                        {userData.level}
                                    </text>
                                </svg>
                            </div>
                        </div>
                        <h3 className="mt-2 font-semibold">{userData.name}</h3>
                        <p className="text-sm text-gray-500">Aspiring Changemaker</p>
                    </div>
                    {userData.dream && (
                        <div>
                            <h4 className="mb-1 font-semibold">Mission</h4>
                            <p className="text-sm text-gray-600">{userData.dream}</p>
                        </div>
                    )}
                    {userData.selectedCauses.length > 0 && (
                        <div>
                            <h4 className="mb-1 font-semibold">Causes</h4>
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
                            <h4 className="mb-1 font-semibold">Active Quests</h4>
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
                            <h4 className="mb-1 font-semibold">Skills</h4>
                            <div className="flex flex-wrap gap-1">
                                {userData.selectedOffers.map((offer) => (
                                    <Badge key={offer.id} variant="secondary">
                                        {offer.name}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                    {userData.badges.length > 0 && (
                        <div>
                            <h4 className="mb-1 font-semibold">Badges</h4>
                            <div className="flex flex-wrap gap-1">
                                {userData.badges.map((badge) => (
                                    <Badge
                                        key={badge.id}
                                        variant="outline"
                                        className="text-lg"
                                        title={badge.description}
                                    >
                                        {badge.icon}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-blue-100 p-4">
            <Card className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white/80 shadow-xl backdrop-blur-sm">
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
                                            <h2 className="text-3xl font-bold text-gray-800">Welcome to Circles</h2>
                                            <p className="text-lg text-gray-600">
                                                Join a community of changemakers and embark on a journey to create
                                                positive impact. Are you ready to play for a better world?
                                            </p>
                                            <Button onClick={nextStep} className="mx-auto mt-4">
                                                Start Your Adventure
                                            </Button>
                                        </div>
                                    )}

                                    {step === 2 && (
                                        <div className="space-y-4">
                                            <h2 className="text-2xl font-semibold text-gray-800">Your Mission</h2>
                                            <p className="text-gray-600">
                                                Define your purpose and the change you want to see in the world.
                                            </p>
                                            <Card className="mb-4 bg-gray-100 p-4">
                                                <Quote className="mx-auto mb-2 text-blue-500" />
                                                <p className="mb-2 text-sm italic text-gray-800">
                                                    "My mission is to create a world where every child has access to
                                                    quality education, regardless of their background. I believe that by
                                                    empowering young minds, we can solve the world's most pressing
                                                    challenges and create a brighter future for all."
                                                </p>
                                                <div className="flex items-center justify-center space-x-2">
                                                    <Avatar>
                                                        <AvatarImage
                                                            src="/placeholder.svg?height=40&width=40"
                                                            alt="Sarah Lee"
                                                        />
                                                        <AvatarFallback>SL</AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-sm font-medium">Sarah Lee</span>
                                                </div>
                                            </Card>
                                            <div className="space-y-2">
                                                <Label htmlFor="dream">What is your mission in this world?</Label>
                                                <Input
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
                                                <Button onClick={prevStep} variant="outline">
                                                    Back
                                                </Button>
                                                <Button onClick={nextStep}>Next</Button>
                                            </div>
                                        </div>
                                    )}

                                    {step === 3 && (
                                        <div className="space-y-4">
                                            <h2 className="text-2xl font-semibold text-gray-800">Choose Your Causes</h2>
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
                                                            key={cause.id}
                                                            item={cause}
                                                            isSelected={userData.selectedCauses.some(
                                                                (c) => c.id === cause.id,
                                                            )}
                                                            onToggle={handleCauseToggle}
                                                        />
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                            <div className="flex flex-wrap">
                                                {userData.selectedCauses.map((cause) => (
                                                    <SelectedItemBadge
                                                        key={cause.id}
                                                        item={cause}
                                                        onRemove={handleCauseToggle}
                                                    />
                                                ))}
                                            </div>
                                            <div className="mt-4 flex items-center justify-between">
                                                <Button onClick={prevStep} variant="outline">
                                                    Back
                                                </Button>
                                                <Button
                                                    onClick={nextStep}
                                                    disabled={userData.selectedCauses.length < 2}
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
                                            <h2 className="text-2xl font-semibold text-gray-800">
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
                                                <Button onClick={prevStep} variant="outline">
                                                    Back
                                                </Button>
                                                <Button
                                                    onClick={nextStep}
                                                    disabled={userData.selectedOffers.length < 1}
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
                                            <h2 className="text-2xl font-semibold text-gray-800">Embark on Quests</h2>
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
                                                <Button onClick={prevStep} variant="outline">
                                                    Back
                                                </Button>
                                                <Button
                                                    onClick={nextStep}
                                                    disabled={userData.selectedQuests.length < 1}
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
                                                <Image
                                                    src="/info3.png"
                                                    alt="Global community"
                                                    width={300}
                                                    height={200}
                                                    className="mx-auto rounded-lg"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black bg-opacity-50">
                                                    <div className="max-w-[250px] rounded-lg bg-white p-4 text-center">
                                                        <Quote className="mx-auto mb-2 text-blue-500" />
                                                        <p className="mb-2 text-sm italic text-gray-800">
                                                            "Circles has helped me level up my impact! I've connected
                                                            with amazing people and we're tackling ocean cleanup
                                                            together."
                                                        </p>
                                                        <div className="flex items-center justify-center space-x-2">
                                                            <Avatar>
                                                                <AvatarImage
                                                                    src="/placeholder.svg?height=40&width=40"
                                                                    alt="Joe Doe"
                                                                />
                                                                <AvatarFallback>JD</AvatarFallback>
                                                            </Avatar>
                                                            <span className="text-sm font-medium">Joe Doe</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <h2 className="text-2xl font-semibold text-gray-800">
                                                Welcome, Changemaker!
                                            </h2>
                                            <p className="text-gray-600">
                                                Your journey in Circles begins now. Here's a glimpse of the world you're
                                                about to enter:
                                            </p>
                                            <div className="grid grid-cols-2 gap-4">
                                                <Card className="bg-white p-4">
                                                    <h3 className="text-lg font-semibold">12,500+</h3>
                                                    <p className="text-sm text-gray-500">Fellow adventurers</p>
                                                </Card>
                                                <Card className="bg-white p-4">
                                                    <h3 className="text-lg font-semibold">500+</h3>
                                                    <p className="text-sm text-gray-500">Active quests</p>
                                                </Card>
                                                <Card className="bg-white p-4">
                                                    <h3 className="text-lg font-semibold">50+</h3>
                                                    <p className="text-sm text-gray-500">Realms to explore</p>
                                                </Card>
                                                <Card className="bg-white p-4">
                                                    <h3 className="text-lg font-semibold">100+</h3>
                                                    <p className="text-sm text-gray-500">Circles to join</p>
                                                </Card>
                                            </div>
                                            <p className="text-gray-600">
                                                Get ready to connect with allies, join guilds, and embark on
                                                world-changing quests!
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Remember, you're part of a supportive community. Don't hesitate to reach
                                                out, collaborate, and make a difference together!
                                            </p>
                                            <div className="mt-4 flex items-center justify-center">
                                                <Button
                                                    onClick={() => alert("Adventure started! Welcome to Circles!")}
                                                    className="mx-auto"
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
