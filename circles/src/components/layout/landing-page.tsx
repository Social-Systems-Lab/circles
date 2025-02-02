"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { ArrowRight } from "lucide-react";

export default function LandingPage() {
    const [currentSlide, setCurrentSlide] = useState(0);
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);
    const slideRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    const features = [
        {
            image: "/images/info2.png",
            title: "Connect",
            description:
                "Find like-minded changemakers and projects that align with your passion, both locally and globally.",
        },
        {
            image: "/images/info3.png",
            title: "Collaborate",
            description: "Work together seamlessly with integrated tools for decision-making and project management.",
        },
        {
            image: "/images/info4.png",
            title: "Create Change",
            description: "Turn ideas into impactful actions and make a real difference in your community and beyond.",
        },
    ];

    const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        touchStartX.current = clientX;
    };

    const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!touchStartX.current) return;
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        touchEndX.current = clientX;
    };

    const handleEnd = () => {
        if (touchStartX.current && touchEndX.current) {
            if (touchStartX.current - touchEndX.current > 75) {
                setCurrentSlide((prev) => (prev + 1) % features.length);
            } else if (touchEndX.current - touchStartX.current > 75) {
                setCurrentSlide((prev) => (prev - 1 + features.length) % features.length);
            }
        }
        touchStartX.current = 0;
        touchEndX.current = 0;
    };

    useEffect(() => {
        const updateWidth = () => {
            if (containerRef.current) {
                setContainerWidth(containerRef.current.offsetWidth);
            }
        };

        updateWidth();
        window.addEventListener("resize", updateWidth);
        return () => window.removeEventListener("resize", updateWidth);
    }, []);

    useEffect(() => {
        if (slideRef.current && containerWidth) {
            slideRef.current.style.transform = `translateX(-${currentSlide * containerWidth}px)`;
        }
    }, [currentSlide, containerWidth]);

    return (
        <div className="flex h-full flex-1 select-none flex-col items-center justify-center bg-[#fbfbfb] px-4 text-gray-800">
            <main className="w-full max-w-6xl">
                {/* Hero Section */}
                <div className="mb-16 flex items-center justify-center gap-4">
                    <div className="h-16 w-16 overflow-hidden rounded-full bg-white p-[2px] shadow-lg md:h-[100px] md:w-[100px]">
                        <Image
                            src="/images/default-picture.png"
                            alt="Circles Logo"
                            width={80}
                            height={80}
                            className="h-full w-full object-cover"
                        />
                    </div>
                    <h1 className="text-center text-5xl font-bold text-black sm:text-6xl md:text-7xl">Circles</h1>
                </div>

                {/* Features Section */}
                <div className="mb-16">
                    {/* Desktop View */}
                    <div className="hidden grid-cols-3 gap-12 md:grid">
                        {features.map((feature, index) => (
                            <FeatureCard key={index} {...feature} />
                        ))}
                    </div>

                    {/* Mobile Carousel */}
                    <div
                        className="cursor-pointer overflow-hidden md:hidden"
                        ref={containerRef}
                        onTouchStart={handleStart}
                        onTouchMove={handleMove}
                        onTouchEnd={handleEnd}
                        onMouseDown={handleStart}
                        onMouseMove={handleMove}
                        onMouseUp={handleEnd}
                        onMouseLeave={handleEnd}
                    >
                        <div
                            ref={slideRef}
                            className="flex transition-transform duration-300 ease-in-out"
                            style={{
                                width: `${features.length * 100}%`,
                                transform: `translateX(-${currentSlide * (containerWidth || 0)}px)`,
                            }}
                        >
                            {features.map((feature, index) => (
                                <div key={index} style={{ width: containerWidth || "100%" }} className="flex-shrink-0">
                                    <FeatureCard {...feature} />
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 flex justify-center">
                            {features.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setCurrentSlide(index)}
                                    className={`mx-1 h-2 w-2 rounded-full ${currentSlide === index ? "bg-blue-600" : "bg-blue-200"}`}
                                    aria-label={`Go to slide ${index + 1}`}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Call to Action */}
                <div className="text-center">
                    <Link
                        href="/signup"
                        className="inline-flex items-center rounded-full bg-blue-600 px-8 py-3 text-lg font-semibold text-white transition duration-300 hover:bg-blue-700"
                    >
                        Sign Up
                        <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                    <p className="mt-4 text-gray-600">
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

type FeatureCardProps = {
    image: string;
    title: string;
    description: string;
};
function FeatureCard({ image, title, description }: FeatureCardProps) {
    return (
        <div className="mx-auto flex max-w-xs flex-col items-center rounded-[15px] bg-white px-6 py-8 text-center shadow-lg">
            <div className="relative mb-6 h-64 w-64">
                <Image src={image} alt={title} fill className="rounded-xl object-contain" />
            </div>
            <h2 className="mb-3 text-2xl font-semibold text-black">{title}</h2>
            <p className="text-lg leading-relaxed text-black">{description}</p>
        </div>
    );
}
