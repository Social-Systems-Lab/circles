"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useIsMobile } from "../utils/use-is-mobile";
// Import your carousel components
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { useEffect } from "react";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

type FeatureCardProps = {
    image: string;
    title: string;
    description: string;
};

const features: FeatureCardProps[] = [
    {
        image: "/images/info2.png",
        title: "Connect",
        description: "Find like-minded changemakers and projects that align with your passion.",
    },
    {
        image: "/images/info3.png",
        title: "Collaborate",
        description: "Work together seamlessly with integrated tools for decision-making.",
    },
    {
        image: "/images/info4.png",
        title: "Create Change",
        description: "Turn ideas into impactful actions and make a difference in your community.",
    },
];

function FeatureCard({ image, title, description }: FeatureCardProps) {
    return (
        <div className="mx-auto flex w-full max-w-xs flex-col items-center rounded-xl bg-white p-6 text-center shadow-md">
            <Image
                src={image}
                alt={title}
                width={300}
                height={300}
                className="mb-4 h-auto w-full rounded-lg object-contain"
            />
            <h2 className="mb-2 text-xl font-semibold">{title}</h2>
            <p className="text-sm text-gray-700">{description}</p>
        </div>
    );
}

export default function LandingPage() {
    const isMobile = useIsMobile();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.LandingPage.1");
        }
    }, []);

    return (
        <div className="flex min-h-screen flex-col items-center bg-gray-50 px-4 text-gray-800">
            <main className="w-screen max-w-6xl md:py-8">
                {/* Hero */}
                <div className="m-4 flex flex-row items-center justify-center gap-2 md:mb-12 md:flex-col">
                    <div className="h-16 w-16 overflow-hidden rounded-full bg-white p-2 shadow-lg md:h-24 md:w-24">
                        <Image
                            src="/images/default-picture.png"
                            alt="Circles Logo"
                            width={80}
                            height={80}
                            className="h-full w-full object-cover"
                        />
                    </div>
                    <div className="text-4xl font-bold md:mt-4 md:text-6xl">Circles</div>
                </div>

                {/* Features */}
                <div className="mb-16">
                    {isMobile ? (
                        <Carousel className="w-full md:hidden">
                            <CarouselContent>
                                {features.map((feature, index) => (
                                    <CarouselItem key={index}>
                                        <FeatureCard {...feature} />
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                        </Carousel>
                    ) : (
                        <div className="hidden grid-cols-3 gap-6 md:grid">
                            {features.map((feature, index) => (
                                <FeatureCard key={index} {...feature} />
                            ))}
                        </div>
                    )}
                </div>

                {/* CTA */}
                <div className="text-center">
                    <Link
                        href="/signup"
                        className="inline-flex items-center rounded-full bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
                    >
                        Sign Up
                        <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                    <p className="mt-4 text-sm text-gray-600">
                        Already have an account?{" "}
                        <Link href="/login" className="text-purple-600 hover:underline">
                            Log in
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    );
}
