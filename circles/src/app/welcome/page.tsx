import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ChevronRight } from "lucide-react";
import { Montserrat, Noto_Serif } from "next/font/google";
import { cn } from "@/lib/utils";

const montserrat = Montserrat({
    subsets: ["latin"],
    variable: "--font-montserrat",
});

const notoSerif = Noto_Serif({
    subsets: ["latin"],
    variable: "--font-noto-serif",
});

export default function KamooniLandingPage() {
    const faqItems = [
        {
            question: "Do I have to pay to join?",
            answer: "Kamooni is free to join and participate in some ways, we&apos;re happy. But by becoming a founding member, you get a vote on how the community is run and help us keep the platform ad-free and independent.",
        },
        {
            question: "What makes Kamooni different from other social platforms?",
            answer: "Kamooni is designed for social impact, focusing on collaboration, empowerment, and real-world change. It's community-owned, ad-free, and prioritizes user data privacy and ethical technology. We aim to connect individuals with a right to privacy and tools designed to empower, not pacify, you.",
        },
        {
            question: "How is my data protected?",
            answer: "We are committed to strong data protection principles. Your data is not sold to third parties, and we are transparent about how we use information to improve the platform. As a community-governed platform, data policies will be decided with member input.",
        },
    ];

    return (
        <div
            className={cn(
                "text-kam-gray-dark flex min-h-screen flex-col bg-white",
                montserrat.variable,
                notoSerif.variable,
            )}
        >
            {/* Header */}
            <header className="sticky top-0 z-50 bg-white shadow-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
                    <Link href="/" className="group flex items-center">
                        <Image
                            src="/kamooni-icon.png"
                            alt="Kamooni Logo Icon"
                            width={40}
                            height={40}
                            className="h-8 w-auto transition-opacity duration-150 group-hover:opacity-80 sm:h-10"
                        />
                        <div className="ml-2 transition-opacity duration-150 group-hover:opacity-80">
                            <span className="text-kam-gray-dark text-xl font-semibold">Kamooni</span>
                            <span className="text-kam-gray-dark/70 -mt-1 block text-xs">the social impact network</span>
                        </div>
                    </Link>
                    <Button className="bg-kam-button-red-orange hover:bg-kam-button-red-orange/90 px-4 py-2 text-sm text-white">
                        Login/Join
                    </Button>
                </div>
            </header>

            {/* Hero Section */}
            <section className="bg-kam-hero-yellow relative overflow-hidden py-16 text-center sm:py-24">
                {/* Background Flowers */}
                <div
                    className="pointer-events-none absolute -left-[80px] -top-[60px] h-[300px] w-[300px] rotate-12 transform opacity-60 
                      sm:-left-[90px] sm:-top-[70px] sm:h-[350px] sm:w-[350px] 
                      md:-left-[100px] md:-top-[80px] md:h-[400px] md:w-[400px]"
                >
                    <Image
                        src="/images/flower-bg.png"
                        alt="Background Flower Top Left"
                        fill
                        className="object-contain"
                    />
                </div>
                <div
                    className="pointer-events-none absolute -bottom-[60px] -right-[80px] h-[300px] w-[300px] -rotate-12 transform opacity-60
                      sm:-bottom-[70px] sm:-right-[90px] sm:h-[350px] sm:w-[350px]
                      md:-bottom-[80px] md:-right-[100px] md:h-[400px] md:w-[400px]"
                >
                    <Image
                        src="/images/flower-bg.png"
                        alt="Background Flower Bottom Right"
                        fill
                        className="object-contain"
                    />
                </div>

                <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8">
                    <Image
                        src="/images/logo-white.png"
                        alt="Kamooni Hero Icon"
                        width={400}
                        height={382}
                        className="mx-auto mb-4 h-36 w-auto sm:h-44 lg:h-48"
                    />
                    <h1 className="mb-6 text-4xl font-bold text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)] sm:text-5xl">
                        Kamooni
                    </h1>
                    <p className="mb-8 text-xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] sm:text-2xl">
                        No Ads. No Big Tech. Ethical and Open-Source
                    </p>
                    <Button className="bg-kam-button-red-orange hover:bg-kam-button-red-orange/90 mb-4 px-8 py-3 text-lg text-white">
                        Test Pilot Signup <ChevronRight className="ml-2 h-5 w-5" />
                    </Button>
                </div>
            </section>

            {/* Most networks distract */}
            <section className="bg-white py-12 sm:py-20">
                <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <h2 className="text-kam-gray-dark mb-6 text-center text-3xl font-bold sm:text-4xl">
                        Most social media distracts. <span className="text-kam-yellow block">We connect.</span>
                    </h2>
                    <div className="text-left">
                        <p className="text-kam-gray-dark/80 mb-4 text-lg leading-relaxed">
                            In a world full of noise, disconnection, and doomscrolling, we offer something different.
                            Changemakers need more than likes and shares. They need real-world impact. They need
                            funding. They need resources. But, most of all, they need each other. Kamooni is designed
                            and built to help us find each other and get things done together.
                        </p>
                        <div className="mt-8 text-center">
                            <Button
                                variant="outline"
                                className="border-kam-button-red-orange text-kam-button-red-orange hover:bg-kam-button-red-orange text-md px-6 py-2 hover:text-white"
                            >
                                13 Reasons to Join
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Tools for Transformation */}
            <section className="bg-kam-hero-yellow py-12 sm:py-20">
                <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <h2 className="text-kam-gray-dark mb-6 text-center text-3xl font-bold sm:text-4xl">
                        Tools for Transformation
                    </h2>
                    <div className="text-left">
                        <p className="text-kam-gray-dark mb-4 text-lg leading-relaxed">
                            Kamooni is designed for autonomy, empowerment, collaboration and action: we provide a unique
                            combination of tools for individuals, projects, and teams, and a map-based interface to find
                            and connect with people doing complementary work nearby. This includes tools for governance,
                            decision-making, community organizing, a research & systems thinking work bench, and ways to
                            share skills, time, volunteer and material assets.
                        </p>
                        <p className="text-kam-gray-dark mb-8 text-lg leading-relaxed">
                            <span className="font-semibold">We are currently in Test Pilot phase.</span> We are still
                            shaping this thing together with our founding members. If you are a changemaker, a community
                            organizer, a researcher, a systems thinker: come look. Help us shape Kamooni with you and
                            for you.
                        </p>
                        <div className="mt-8 text-center">
                            <Button className="bg-kam-button-red-orange hover:bg-kam-button-red-orange/90 px-8 py-3 text-lg text-white">
                                Test Pilot Signup <ChevronRight className="ml-2 h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Who Dis? */}
            <section className="bg-white py-12 sm:py-20">
                <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <h2 className="text-kam-gray-dark mb-6 text-center text-3xl font-bold sm:text-4xl">Who Dis?</h2>
                    <div className="text-left">
                        <p className="text-kam-gray-dark/80 mb-4 text-lg leading-relaxed">
                            We&apos;re a small, independent, not-for-profit called the{" "}
                            <span className="font-semibold">Social Systems Foundation</span>, and supported by the
                            community we serve.
                        </p>
                        <p className="text-kam-gray-dark/80 mb-8 text-lg leading-relaxed">
                            No VCs. No corporate funding. No ads. No extractive growth. 100% organic free-range,
                            grass-fed, non-GMO, gluten-free, cruelty-free, community-governed good. If that resonates,
                            you&apos;re already one of us. Come say hi.
                        </p>
                        <div className="mt-8 text-center">
                            <Button
                                variant="outline"
                                className="border-kam-button-red-orange text-kam-button-red-orange hover:bg-kam-button-red-orange text-md px-6 py-2 hover:text-white"
                            >
                                Meet the team
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Wait, no ads... */}
            <section className="bg-kam-hero-yellow py-12 sm:py-20">
                <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <h2 className="text-kam-gray-dark mb-6 text-center text-3xl font-bold sm:text-4xl">
                        Wait, no ads... <span className="block text-white">Who is paying for this?</span>
                    </h2>
                    <div className="text-left">
                        <p className="text-kam-gray-dark mb-4 text-lg leading-relaxed">
                            You are. But not in a sneaky way, in an up-front way. If our calculations pan out, as long
                            as enough people become founding members, we can keep Kamooni free for everyone to use,
                            forever. We call this <span className="font-semibold">Community-Supported Software</span>.
                        </p>
                        <p className="text-kam-gray-dark mb-4 text-lg leading-relaxed">
                            But there is more to this story. As a member you get a vote on how the community is run. And
                            the platform is designed to help you create, organize, and manage your own projects and
                            communities, with tools for funding, governance, and resource sharing.
                        </p>
                        <p className="text-kam-gray-dark mb-8 text-lg leading-relaxed">
                            Our ultimate goal however, is for Kamooni to become fully distributed with our open source
                            technology, so that any community can run their own instance, completely independently from
                            us. If you like what we&apos;re doing and want to help us share the load with us, join the
                            tribe as a Founding Member for €5 per month.
                        </p>
                        <div className="mt-8 flex flex-col items-center space-y-4 text-center">
                            <Button className="bg-kam-button-red-orange hover:bg-kam-button-red-orange/90 w-full px-8 py-3 text-lg text-white sm:w-auto">
                                Become a Founding Member
                            </Button>
                            <Button
                                variant="link"
                                className="text-kam-button-red-orange hover:text-kam-button-red-orange/80 w-full sm:w-auto"
                            >
                                Lifetink I need a bit more convincing...
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* This sounds great! */}
            <section className="bg-white py-12 sm:py-20">
                <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <h2 className="text-kam-gray-dark mb-6 text-center text-3xl font-bold sm:text-4xl">
                        This sounds great! <span className="text-kam-yellow block">How can I help?</span>
                    </h2>
                    <div className="text-left">
                        <p className="text-kam-gray-dark/80 mb-8 text-lg leading-relaxed">
                            Thanks! We&apos;re pretty pleased with it. If we say so ourselves. But we could definitely
                            use a hand. We always need help with coding, design, testing, community organizing, and just
                            generally spreading the word. If you&apos;ve got some spare cycles and want to help us build
                            this thing, join our test pilots or come visit our Discord server for some watercooler
                            powwows and reach out to us if anything hits your spot!
                        </p>
                        <div className="mt-8 text-center">
                            <Button
                                variant="outline"
                                className="border-kam-button-red-orange text-kam-button-red-orange hover:bg-kam-button-red-orange text-md px-6 py-2 hover:text-white"
                            >
                                Other ways to help
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="bg-kam-hero-yellow py-12 sm:py-20">
                <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <h2 className="text-kam-gray-dark mb-10 text-center text-3xl font-bold sm:text-4xl">FAQ</h2>
                    <Accordion type="single" collapsible className="w-full text-left">
                        {faqItems.map((item, index) => (
                            <AccordionItem value={`item-${index + 1}`} key={index} className="border-b border-white/70">
                                <AccordionTrigger className="text-kam-gray-dark py-4 text-left text-lg font-medium hover:no-underline">
                                    {item.question}
                                </AccordionTrigger>
                                <AccordionContent className="text-md text-kam-gray-dark pb-4 pt-2 leading-relaxed">
                                    {item.answer}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                    <div className="mt-10 text-center">
                        <Button
                            variant="outline"
                            className="border-kam-button-red-orange text-kam-button-red-orange hover:bg-kam-button-red-orange text-md px-6 py-2 hover:text-white"
                        >
                            More Questions?
                        </Button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-kam-gray-dark py-10 text-white sm:py-16">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-3 lg:grid-cols-6 lg:text-left">
                        {[
                            { label: "Social Systems Lab", href: "https://socialsystems.io" },
                            { label: "The Foundation", href: "https://www.socialsystems.io/foundation/" },
                            { label: "Partners", href: "https://www.socialsystems.io/partners/" },
                            { label: "Manifesto", href: "https://vibeapp.dev/manifesto" },
                            { label: "Contact", href: "https://www.socialsystems.io/contact/" },
                        ].map((link) => (
                            <div key={link.label} className="mb-4 lg:mb-0">
                                <Link href={link.href} target="_blank" rel="noopener noreferrer">
                                    <Button
                                        variant="link"
                                        className="text-kam-yellow hover:text-kam-yellow/80 w-full justify-center rounded-md bg-transparent p-2 text-sm capitalize hover:bg-white/10"
                                    >
                                        {link.label}
                                    </Button>
                                </Link>
                            </div>
                        ))}
                        <div className="col-span-2 flex items-center justify-center md:col-span-3 lg:col-span-1 lg:justify-end">
                            <Link
                                href="https://www.socialsystems.io/participate"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button className="bg-kam-yellow hover:bg-kam-yellow/90 text-kam-gray-dark w-full px-6 py-2 text-sm font-semibold sm:w-auto">
                                    Participate
                                </Button>
                            </Link>
                        </div>
                    </div>
                    <div className="border-kam-gray-medium/30 text-kam-gray-light/70 mt-10 border-t pt-8 text-center text-sm">
                        <p>&copy; {new Date().getFullYear()} Kamooni. All rights reserved.</p>
                        <p className="mt-1">Social Systems Foundation</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
