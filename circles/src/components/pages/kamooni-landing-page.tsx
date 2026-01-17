"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
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

export type KamooniLandingVariant = "welcome" | "holding";

interface KamooniLandingPageProps {
    variant?: KamooniLandingVariant;
    maintenanceMessage?: string;
}

export default function KamooniLandingPage({
    variant = "welcome",
    maintenanceMessage = "Maintenance and updates. We should be running smoothly again on Wednesday, 28 January, 2026.",
}: KamooniLandingPageProps) {
    const [showAllFaqs, setShowAllFaqs] = useState(false);
    const isHoldingPage = variant === "holding";

    const faqItems = [
        {
            question: "What is Kamooni?",
            answer: "Kamooni is a social network for changemakers—people who want to build a better world together. It's a place to connect, collaborate, and contribute to meaningful projects, locally or globally.",
        },
        {
            question: "Is Kamooni just another social media platform?",
            answer: "Not at all. Unlike traditional social media, Kamooni is focused on action, not distraction. It's designed to help people do things together—whether that's volunteering, organizing, or building local solutions.",
        },
        {
            question: "Who is Kamooni for?",
            answer: "Kamooni is for anyone who wants to make a difference—activists, organizers, volunteers, community leaders, creatives, social entrepreneurs, and everyday people looking to contribute. It is a community for people who want to make life a little better for everyone, not just themselves.",
        },
        {
            question: "How does Kamooni work?",
            answer: "You create a profile, share your mission, causes, and skills, and Kamooni helps match you with people, projects, and opportunities through a map-based interface and shared interests.",
        },
        {
            question: "What makes Kamooni different from other networks for good?",
            answer: "Kamooni gives you more control over your data, your connections, and your impact. It's values-driven, open-source, and supports direct collaboration, not just awareness or funding. It's basically designed to empower you, not hold you hostage and monetise you in different ways. It also has a very cool map-based interface.",
        },
        {
            question: "What can I do on Kamooni?",
            answer: "In the current version of Kamooni, you can do most everything you'd expect to do on your run-of-the-mill social networking platform, with a few twists. You can create a profile and groups, we call them circles, but you have a lot more control over the access and look of these. We have a built-in task manager to help you and your team get the job done. You can create proposals and have your community vote on them. We have a map-based interface that allows you to explore and connect in an entirely different way. To mention a few features. \n\nOver the next weeks and months, we'll be upgrading the profile pages, adding advanced governance features, such as liquid democracy through delegates, integrated video, a virtue ledger that keeps track of all the tasks you perform, advanced crowdfunding features, local resource sharing, video conferencing with a map view, data layers for the atlas, hosted circles for individuals and orgs that want more control and customisation, community fact checking, proof of humanity and more. \n\nIf you are reading this and joining as a member, you'll be one of the Kamooni Founders. This means you will be able to influence the design and development of the platform significantly.",
        },
        {
            question: "What does the name “Kamooni” mean?",
            answer: '“Kamooni” is loosely based on the Latin communis, meaning "common, public, general, shared by all or many". The name reflects our belief in collective action, sharing and mutual support.',
        },
        {
            question: "Is Kamooni free to use?",
            answer: "This is our ambition. The purpose of Kamooni is to create a better society for all, and that should be free for all who actively contribute to this vision. Unfortunately, we still have bills to pay, so we are asking for a small membership fee from those who can afford it, starting at €1 per month. This helps keep the platform ethical and ad-free, and free for as many users as possible. With ten per cent of Kamooni’s users becoming members, we should have enough funds to keep it open for everyone else.",
        },
        {
            question: "Why should I pay to use Kamooni?",
            answer: "Your membership supports a community-run platform with no corporate surveillance, no ads, and no data harvesting. As a paying member, you'll be making it possible for others to use the platform free of charge. As a member of Kamooni, you also get to vote directly on the direction and development of the network and the platform. Something that can be especially impactful this early on in our development.\n\nWe estimate that one paying member will be enough to support ten non-paying users on Kamooni. If the number of non-paying users increases more than 10:1, we'll put them on a waiting list. However, as a member, you'll be allowed to invite a number of friends who can jump the queue and become instantly active. The number of invites you get depends on how much you donate. For instance, €5 per month will give you four invites that you can send to friends if there is a waiting list.\n\nFinally, as a member, you get an “altruistic” dividend on all profits we make. These funds can't be spent on you personally, though, but you do get to decide which projects on the platform these funds should support. This will all happen through something we call the Altruistic Wallet, which is something else that only members will have access to.",
        },
        {
            question: "What’s the Altruistic Wallet?",
            answer: "It's a new kind of digital wallet where you can donate time, money, or resources—but only to others. It tracks your contributions, helps build your reputation, and supports trustworthy projects. The Altruistic Wallet is designed to be a stand-alone app that anyone can use on any platform that integrates with it. It is still under development, but we plan to release an early version to our members later this year.",
        },
        {
            question: "How do I know I can trust the people and projects on Kamooni?",
            answer: "Kamooni uses a reputation system based on real contributions. Profiles show how people and projects have helped others, not just likes or flashy bios. We are also designing a system of human verification to avoid fake projects created by AI. Ultimately, it is your call who you choose to trust, but we are laying the groundwork for a system that rewards people who live up to their promises and keep their word.",
        },
        {
            question: "How is Kamooni moderated?",
            answer: "Community standards are enforced collaboratively. You decide who can contact you, and the network itself verifies trustworthy users through contribution history and network endorsements.",
        },
        {
            question: "Is Kamooni safe?",
            answer: "As safe as we can make it. You're in full control of your visibility and who can reach out to you. There are also community-driven safety mechanisms to flag abuse or bad actors. As we progress along our roadmap, we'll also integrate with Vibe, which will give you exceptional control over your data.",
        },
        {
            question: "Do I need to be part of a group to join?",
            answer: "Nope. You can join as an individual and find like-hearted people or projects on your own. Of course, you can also invite others and create your own “Circle.”",
        },
        {
            question: "What’s a Circle?",
            answer: "A Circle is a space on Kamooni—it can be a project, a community group, a campaign, or just a place to gather people. You control the settings and membership of all circles you create or are the administrator of.",
        },
        {
            question: "What kind of causes can I support on Kamooni?",
            answer: "Anything from climate action, education, mutual aid, housing, regenerative farming, digital rights, mental health, and beyond. If it makes the world better, it belongs here.",
        },
        {
            question: "I don’t have money. Can I still contribute?",
            answer: "Absolutely. You can offer time, skills, advice, or even lend tools or space. Kamooni values all kinds of contributions, not just cash.",
        },
        {
            question: "Can I use Kamooni for my local community project?",
            answer: "Yes! That's exactly what it's for. Whether it's a local cleanup, food distribution, or community garden, Kamooni helps you organize and find support.",
        },
        {
            question: "How does the map feature work?",
            answer: "You can see where people and projects are around you—or around the world. Filter by skills, needs, or causes and reach out to collaborate.",
        },
        {
            question: "How do I build a good reputation on Kamooni?",
            answer: "By helping others. The more you contribute—whether with time, resources, or advice—the more trust you earn. Your contributions are recorded and verified by the community.",
        },
        {
            question: "Will my data be sold or used for ads?",
            answer: "Never. Kamooni is committed to privacy and ethics. Your data belongs to you, and we'll never sell it or use it to manipulate your behaviour.",
        },
        {
            question: "Is Kamooni open source?",
            answer: "Yes. We believe in transparency and community ownership. Developers and technologists are welcome to help build the platform with us.",
        },
        {
            question: "Can I suggest features or improvements?",
            answer: "Yes, please! Kamooni is co-created with the community. Your feedback helps shape the roadmap and future of the platform.",
        },
        {
            question: "What’s coming next for Kamooni?",
            answer: "We're building peer-to-peer messaging, democratic governance tools, video conferencing, and ways to vote on how platform revenues are reinvested. And yes—profit-sharing too.",
        },
        {
            question: "Who is behind Kamooni?",
            answer: "Kamooni is built by a global network of activists, designers, and technologists through the Social Systems Lab. But most importantly, you are part of shaping it.",
        },
        {
            question: "Is Kamooni global or local?",
            answer: "Both. You can work with people nearby—or join international movements. Kamooni helps you scale from the village to the planet.",
        },
        {
            question: "Can I host my own version of Kamooni?",
            answer: "Eventually yes—Kamooni will support federated hosting, allowing communities to run their own instances of the platform while still being connected.",
        },
        {
            question: "How do I get started?",
            answer: "Just create a profile, add your mission and skills, and explore the map. You'll find people, projects, or tasks to jump into right away.",
        },
        {
            question: "How do I invite others?",
            answer: "You can send invites directly from your profile or Circle. Sharing your Kamooni link on social media is also a great way to grow the network.",
        },
        {
            question: "How can I help Kamooni succeed?",
            answer: "Become a member, use the platform, tell your friends, and if you have time or skills—join our volunteer team. Kamooni grows stronger with every person who contributes.",
        },
        {
            question: "What is a Founding Member?",
            answer: "A Founding Member is someone who joins Kamooni at an early stage when we need you the most. As a founder, you'll be joining this journey pretty much from the start and will have a lot of opportunities to shape both the culture and practices of our community as well as the platform itself. We will be working closely with our members when developing tools and practices alike, so your voice will be heard and your vote will count. \n\nAs a Founding Member, you will get the title “Founder” on your profile for the duration of your membership in Kamooni.",
        },
    ];

    const displayedFaqs = showAllFaqs ? faqItems : faqItems.slice(0, 3);

    return (
        <div
            className={cn(
                "flex min-h-screen flex-col bg-white text-kam-gray-dark",
                montserrat.variable,
                notoSerif.variable,
            )}
        >
            {/* Header */}
            <header className="sticky top-0 z-20 bg-white shadow-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
                    <Link href="/" className="group flex items-center">
                        <Image
                            src="/images/logo-test3.jpg"
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
                    <Button
                        onClick={(event) => event.preventDefault()}
                        className="mb-6 cursor-default bg-[#c84521] px-8 py-3 text-lg font-semibold text-white shadow-md shadow-black/10 transition-colors hover:bg-[#a83218]"
                    >
                        {maintenanceMessage}
                    </Button>
                    {isHoldingPage ? (
                        <p className="text-lg font-medium text-white">
                            We&apos;re making some improvements right now. Thanks for your patience while we deploy the
                            updates.
                        </p>
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                            <Link href="/signup">
                                <Button className="bg-kam-button-red-orange px-8 py-3 text-lg text-white hover:bg-kam-button-red-orange/90">
                                    Test Pilot Signup <ChevronRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                            <Link href="/explore">
                                <Button
                                    variant="outline"
                                    className="text-md border-kam-button-red-orange px-6 py-2 text-kam-button-red-orange hover:bg-kam-button-red-orange hover:text-white"
                                >
                                    Explore the platform
                                </Button>
                            </Link>
                        </div>
                    )}
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
                            <Link href="https://mrtimtim.medium.com/kamooni-community-for-changemakers-bba055a5ba75">
                                <Button
                                    variant="outline"
                                    className="text-md border-kam-button-red-orange px-6 py-2 text-kam-button-red-orange hover:bg-kam-button-red-orange hover:text-white"
                                >
                                    Our Story
                                </Button>
                            </Link>
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
                            volunteer, a community organizer, a researcher, a systems thinker, we&apos;d love to shape
                            Kamooni with you and for you.
                        </p>
                        {!isHoldingPage && (
                            <div className="mt-8 text-center">
                                <Link href="/signup">
                                    <Button className="bg-kam-button-red-orange px-8 py-3 text-lg text-white hover:bg-kam-button-red-orange/90">
                                        Test Pilot Signup <ChevronRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                            </div>
                        )}
                        {isHoldingPage && (
                            <p className="mt-8 text-center text-base text-kam-gray-dark">
                                Hold tight while we fine-tune the experience—you&apos;ll be able to jump back in soon.
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* Video Section */}
            <section className="bg-white py-12 sm:py-20">
                <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
                    <h2 className="mb-6 text-center text-3xl font-bold text-kam-gray-dark sm:text-4xl">
                        Watch Kamooni in Action
                    </h2>
                    <p className="mx-auto mb-8 max-w-2xl text-center text-lg leading-relaxed text-kam-gray-dark/80">
                        A quick overview of what we’re building and how you can take part.
                    </p>
                    <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-xl shadow-lg ring-1 ring-black/5">
                        {/* 16:9 responsive iframe */}
                        <div className="relative h-0 w-full" style={{ paddingBottom: "56.25%" }}>
                            <iframe
                                className="absolute left-0 top-0 h-full w-full"
                                src="https://www.youtube.com/embed/DBlJYdMKsTU"
                                title="Kamooni video"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                referrerPolicy="strict-origin-when-cross-origin"
                                allowFullScreen
                            />
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
                        <div className="mt-8 text-center">
                            <Link href="https://www.socialsystems.io/our_people/">
                                <Button
                                    variant="outline"
                                    className="text-md border-kam-button-red-orange px-6 py-2 text-kam-button-red-orange hover:bg-kam-button-red-orange hover:text-white"
                                >
                                    Meet the Team
                                </Button>
                            </Link>
                        </div>
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
                            <Link
                                href="https://mrtimtim.medium.com/the-altruistic-wallet-9163f19a0946"
                                className="text-kam-button-red-orange hover:underline"
                            >
                                {" "}
                                Altruistic Wallet
                            </Link>
                            , another cool technology we are developing at the lab.
                        </p>
                        <p className="mb-8 text-lg leading-relaxed text-kam-gray-dark">
                            Our ultimate goal is for Kamooni to become fully distributed, with our members providing all
                            the bandwidth and storage for the network to work entirely autonomously. But for now, our
                            paying members are carrying the network. If you&apos;d like to share the load with us, join
                            the tribe as a Founding Member by donating $1 or more per month.
                        </p>
                        {!isHoldingPage && (
                            <div className="mt-8 flex flex-col items-center space-y-4 text-center">
                                <Link href="/signup">
                                    <Button className="w-full bg-kam-button-red-orange px-8 py-3 text-lg text-white hover:bg-kam-button-red-orange/90 sm:w-auto">
                                        Become a Founding Member
                                    </Button>
                                </Link>
                                <Link
                                    href="/docs/Seven Reasons to join Kamooni.pdf"
                                    className="text-sm text-kam-gray-dark hover:underline"
                                >
                                    Read: Seven Reasons to join Kamooni (PDF)
                                </Link>
                            </div>
                        )}
                        {isHoldingPage && (
                            <p className="mt-8 text-center text-base text-kam-gray-dark">
                                Membership actions are paused until we&apos;re back online. We appreciate your support.
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="bg-white py-12 sm:py-20">
                <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
                    <h2 className="mb-6 text-center text-3xl font-bold text-kam-gray-dark sm:text-4xl">FAQ</h2>
                    <p className="mx-auto mb-10 max-w-2xl text-center text-lg text-kam-gray-dark/80">
                        Quick answers to some of the big questions we get asked about Kamooni.
                    </p>
                    <Accordion type="single" collapsible className="space-y-4">
                        {displayedFaqs.map((faq, index) => (
                            <AccordionItem
                                key={faq.question}
                                value={`faq-${index}`}
                                className="rounded-xl border-2 border-kam-button-red-orange/20 px-4"
                            >
                                <AccordionTrigger className="text-left text-lg font-semibold text-kam-gray-dark hover:no-underline">
                                    {faq.question}
                                </AccordionTrigger>
                                <AccordionContent className="text-kam-gray-dark/80">{faq.answer}</AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                    {!showAllFaqs && faqItems.length > 3 && (
                        <div className="mt-8 text-center">
                            <Button
                                variant="outline"
                                onClick={() => setShowAllFaqs(true)}
                                className="border-kam-button-red-orange px-6 py-2 text-kam-button-red-orange hover:bg-kam-button-red-orange hover:text-white"
                            >
                                Show more
                            </Button>
                        </div>
                    )}
                    {showAllFaqs && (
                        <div className="mt-4 text-center">
                            <Button
                                variant="outline"
                                onClick={() => setShowAllFaqs(false)}
                                className="border-kam-button-red-orange px-6 py-2 text-kam-button-red-orange hover:bg-kam-button-red-orange hover:text-white"
                            >
                                Show fewer
                            </Button>
                        </div>
                    )}
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-kam-gray-dark py-8 text-white">
                <div className="container mx-auto flex flex-col items-center justify-between px-4 text-center text-sm sm:flex-row sm:text-left">
                    <p>© {new Date().getFullYear()} Kamooni. All rights reserved.</p>
                    <div className="mt-4 flex space-x-4 sm:mt-0">
                        <Link href="https://socialsystems.io" className="hover:underline">
                            Social Systems Lab
                        </Link>
                        <Link href="https://instagram.com/kamooni.network" className="hover:underline">
                            Instagram
                        </Link>
                        <Link href="mailto:info@kamooni.org" className="hover:underline">
                            Contact
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
