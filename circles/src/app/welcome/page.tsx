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
            answer: "Kamooni is free to join and participate in some ways, we're happy. But by becoming a founding member, you get a vote on how the community is run and help us keep the platform ad-free and independent.",
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
                "flex min-h-screen flex-col bg-white text-kam-gray-dark",
                montserrat.variable,
                notoSerif.variable,
            )}
        >
            {/* Header */}
            <header className="sticky top-0 z-50 bg-white shadow-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
                    <Link href="/" className="group flex items-center">
                        <Image
                            src="/images/logo.png"
                            alt="Kamooni Logo Icon"
                            width={40}
                            height={40}
                            className="h-8 w-auto transition-opacity duration-150 group-hover:opacity-80 sm:h-10"
                        />
                        <div className="ml-2 transition-opacity duration-150 group-hover:opacity-80">
                            <span className="text-xl font-semibold text-kam-gray-dark">Kamooni</span>
                            <span className="-mt-1 block text-xs text-kam-gray-dark/70">the social impact network</span>
                        </div>
                    </Link>
                    <Button className="bg-kam-button-red-orange px-4 py-2 text-sm text-white hover:bg-kam-button-red-orange/90">
                        Login/Join
                    </Button>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative overflow-hidden bg-kam-hero-yellow py-16 text-center sm:py-24">
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
                    <Link href="/signup">
                        <Button className="mb-4 bg-kam-button-red-orange px-8 py-3 text-lg text-white hover:bg-kam-button-red-orange/90">
                            Test Pilot Signup <ChevronRight className="ml-2 h-5 w-5" />
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Most networks distract */}
            <section className="bg-white py-12 sm:py-20">
                <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <h2 className="mb-6 text-center text-3xl font-bold text-kam-gray-dark sm:text-4xl">
                        Most social media distracts. <span className="block text-kam-yellow">We connect.</span>
                    </h2>
                    <div className="text-left">
                        <p className="mb-4 text-lg leading-relaxed text-kam-gray-dark/80">
                            In a world full of noise, disconnection, and shallow engagement, Changemakers need more than
                            likes and comment threads. They need tools to collaborate, build trust, and make real-world
                            impact. They need funding. They need resources. But, most of all, they need each other. They
                            need a community.
                        </p>
                        <p className="text-lg leading-relaxed text-kam-gray-dark/80">
                            Kamooni is designed and built to help us find each other and get things done together.
                        </p>
                        <div className="mt-8 text-center">
                            <Button
                                variant="outline"
                                className="text-md border-kam-button-red-orange px-6 py-2 text-kam-button-red-orange hover:bg-kam-button-red-orange hover:text-white"
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
                    <h2 className="mb-6 text-center text-3xl font-bold text-kam-gray-dark sm:text-4xl">
                        Tools for Transformation
                    </h2>
                    <div className="text-left">
                        <p className="mb-4 text-lg leading-relaxed text-kam-gray-dark">
                            Kamooni is designed for autonomy, empowerment, collaboration and action. We provide a
                            mission-based, customizable profile page, tools to create and manage communities, projects,
                            and teams, and a map-based interface to find and connect with people doing meaningful work
                            across the globe. We are also developing a new kind of trust system built on contributions,
                            not popularity, and new tools for governance and profit sharing. We are also integrating a
                            crowdfunding feature that lets you accept not only money but also volunteers and material
                            assets.
                        </p>
                        <p className="mb-8 text-lg leading-relaxed text-kam-gray-dark">
                            That said, Kamooni is currently in its{" "}
                            <span className="font-semibold">Test Pilot phase</span>. We&apos;re still shaping this
                            thing—carefully, collaboratively. If you&apos;re an activist, a project steward, a
                            volunteer, a community organizer, a researcher, a systems thinker, wevd love to shape
                            Kamooni with you and for you.
                        </p>
                        <div className="mt-8 text-center">
                            <Link href="/signup">
                                <Button className="bg-kam-button-red-orange px-8 py-3 text-lg text-white hover:bg-kam-button-red-orange/90">
                                    Test Pilot Signup <ChevronRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Who Dis? */}
            <section className="bg-white py-12 sm:py-20">
                <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <h2 className="mb-6 text-center text-3xl font-bold text-kam-gray-dark sm:text-4xl">Who Dis?</h2>
                    <div className="text-left">
                        <p className="mb-4 text-lg leading-relaxed text-kam-gray-dark/80">
                            We are a small, independent team stewarded by the Social Systems Foundation, and supported
                            by the community we serve.
                        </p>
                        <p className="mb-4 text-lg leading-relaxed text-kam-gray-dark/80">
                            No VCs. No founders cashing out. No extractive growth. One hundred per cent oligarch-free.
                            Just open-source tools built in the service of something better. Something greater.
                        </p>
                        <p className="text-lg leading-relaxed text-kam-gray-dark/80">
                            If that resonates, you&apos;re already one of us. Come say hi.
                        </p>
                    </div>
                </div>
            </section>

            {/* Wait, no ads... */}
            <section className="bg-kam-hero-yellow py-12 sm:py-20">
                <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <h2 className="mb-6 text-center text-3xl font-bold text-kam-gray-dark sm:text-4xl">
                        Wait, no ads... <span className="block text-white">Who is paying for this?</span>
                    </h2>
                    <div className="text-left">
                        <p className="mb-4 text-lg leading-relaxed text-kam-gray-dark">
                            You are. But not in a sneaky way. In an up-front way. If our calculations pan out, as long
                            as one user out of ten becomes a contributing member, we&apos;ll have the funds we need to
                            keep the lights on and the change supported.
                        </p>
                        <p className="mb-4 text-lg leading-relaxed text-kam-gray-dark">
                            But there is more to this story. As a member you get a vote on how the community is run, how
                            the platform is developed and where we spend any profits we make. This happens through the
                            Altruistic Wallet, another cool technology we are developing at the lab.
                        </p>
                        <p className="mb-8 text-lg leading-relaxed text-kam-gray-dark">
                            Our ultimate goal is for Kamooni to become fully distributed, with our members providing all
                            the bandwidth and storage for the network to work entirely autonomously. But for now, our
                            paying members are carrying the network. If you&apos;d like to share the load with us, join
                            the tribe as a Founding Member by donating $1 or more per month.
                        </p>
                        <div className="mt-8 flex flex-col items-center space-y-4 text-center">
                            <Link href="/signup">
                                <Button className="w-full bg-kam-button-red-orange px-8 py-3 text-lg text-white hover:bg-kam-button-red-orange/90 sm:w-auto">
                                    Become a Founding Member
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* This sounds great! */}
            <section className="bg-white py-12 sm:py-20">
                <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <h2 className="mb-6 text-center text-3xl font-bold text-kam-gray-dark sm:text-4xl">
                        This sounds great! <span className="block text-kam-yellow">How can I help?</span>
                    </h2>
                    <div className="text-left">
                        <p className="mb-8 text-lg leading-relaxed text-kam-gray-dark/80">
                            Thanks! We&apos;re pretty pleased with it, if we say so ourselves, but we could definitely
                            use some help. Obviously, funding is always an issue, but we could use help in most areas,
                            such as development, UX-design, marketing, outreach, onboarding and more. Check out the
                            lab&apos;s website for some useful pointers and reach out to us if anything hits your spot!
                        </p>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="bg-kam-hero-yellow py-12 sm:py-20">
                <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <h2 className="mb-10 text-center text-3xl font-bold text-kam-gray-dark sm:text-4xl">FAQ</h2>
                    <Accordion type="single" collapsible className="w-full text-left">
                        {faqItems.map((item, index) => (
                            <AccordionItem value={`item-${index + 1}`} key={index} className="border-b border-white/70">
                                <AccordionTrigger className="py-4 text-left text-lg font-medium text-kam-gray-dark hover:no-underline">
                                    {item.question}
                                </AccordionTrigger>
                                <AccordionContent className="text-md pb-4 pt-2 leading-relaxed text-kam-gray-dark">
                                    {item.answer}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                    <div className="mt-10 text-center">
                        <Button
                            variant="outline"
                            className="text-md border-kam-button-red-orange px-6 py-2 text-kam-button-red-orange hover:bg-kam-button-red-orange hover:text-white"
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
                                        className="w-full justify-center rounded-md bg-transparent p-2 text-sm capitalize text-kam-yellow hover:bg-white/10 hover:text-kam-yellow/80"
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
                                <Button className="w-full bg-kam-yellow px-6 py-2 text-sm font-semibold text-kam-gray-dark hover:bg-kam-yellow/90 sm:w-auto">
                                    Participate
                                </Button>
                            </Link>
                        </div>
                    </div>
                    <div className="mt-10 border-t border-kam-gray-medium/30 pt-8 text-center text-sm text-kam-gray-light/70">
                        <p>&copy; {new Date().getFullYear()} Kamooni. All rights reserved.</p>
                        <p className="mt-1">Social Systems Foundation</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
