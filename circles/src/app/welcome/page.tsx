"use client";

import React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { motion } from "framer-motion";
import { FaCheckCircle } from "react-icons/fa";

const faqs = [
    {
        question: "What is Kamooni?",
        answer: "Kamooni is a platform for building regenerative communities. It's a place to connect with like-minded people, collaborate on projects, and create a better future for everyone.",
    },
    {
        question: "Who is Kamooni for?",
        answer: "Kamooni is for anyone who wants to make a positive impact in the world. Whether you're an individual, a community, or an organization, you'll find a home on Kamooni.",
    },
    {
        question: "How does Kamooni work?",
        answer: "You create a profile, share your mission, SDGs, and skills, and Kamooni helps match you with people, projects, and opportunities through a map-based interface and shared interests.",
    },
    {
        question: "What makes Kamooni different?",
        answer: "Kamooni is built on the principles of regeneration, decentralization, and collaboration. We're a non-profit organization committed to creating a more just, sustainable, and beautiful world.",
    },
    {
        question: "What kind of projects can I find on Kamooni?",
        answer: "You'll find a wide range of projects, from local community gardens to global initiatives focused on renewable energy, education, and social justice.",
    },
    {
        question: "How can I get involved?",
        answer: "Sign up for an account, create your profile, and start exploring. You can join existing circles, start your own, or simply connect with other members who share your passions.",
    },
    {
        question: "Is Kamooni free to use?",
        answer: "Yes, Kamooni is free for individuals and communities. We also offer paid plans for organizations that need advanced features and support.",
    },
    {
        question: "What kind of SDGs can I support on Kamooni?",
        answer: "Anything from climate action, education, mutual aid, housing, regenerative farming, digital rights, mental health, and beyond. If it makes the world better, it belongs here.",
    },
    {
        question: "How is my data protected?",
        answer: "We take your privacy seriously. Kamooni is built on a decentralized architecture that gives you full control over your data. You decide what to share and with whom.",
    },
    {
        question: "How does the map feature work?",
        answer: "You can see where people and projects are around you—or around the world. Filter by skills, needs, or SDGs and reach out to collaborate.",
    },
];

const WelcomePage: React.FC = () => {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white shadow-sm">
                <div className="container mx-auto flex items-center justify-between px-4 py-6">
                    <div className="flex items-center space-x-2">
                        <Image src="/images/logo.png" alt="Kamooni Logo" width={40} height={40} />
                        <span className="text-2xl font-bold text-gray-800">Kamooni</span>
                    </div>
                    <Button onClick={() => router.push("/login")}>Login / Signup</Button>
                </div>
            </header>

            {/* Hero Section */}
            <main className="container mx-auto px-4 py-16 text-center">
                <motion.h1
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="text-5xl font-extrabold text-gray-900"
                >
                    Welcome to the Regenerative Renaissance
                </motion.h1>
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="mx-auto mt-4 max-w-2xl text-xl text-gray-600"
                >
                    Kamooni is your platform to connect, collaborate, and create a thriving future for all.
                </motion.p>
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="mt-8"
                >
                    <Button size="lg" onClick={() => router.push("/signup")}>
                        Join the Movement
                    </Button>
                </motion.div>
            </main>

            {/* Features Section */}
            <section className="bg-white py-20">
                <div className="container mx-auto px-4">
                    <h2 className="mb-12 text-center text-3xl font-bold text-gray-800">Why Kamooni?</h2>
                    <div className="grid gap-8 md:grid-cols-3">
                        <div className="text-center">
                            <FaCheckCircle className="mx-auto mb-4 text-4xl text-green-500" />
                            <h3 className="mb-2 text-xl font-semibold">Find Your Tribe</h3>
                            <p className="text-gray-600">
                                Connect with people who share your values and are working on similar projects.
                            </p>
                        </div>
                        <div className="text-center">
                            <FaCheckCircle className="mx-auto mb-4 text-4xl text-green-500" />
                            <h3 className="mb-2 text-xl font-semibold">Collaborate Seamlessly</h3>
                            <p className="text-gray-600">
                                Use our tools to organize, manage, and grow your community and projects.
                            </p>
                        </div>
                        <div className="text-center">
                            <FaCheckCircle className="mx-auto mb-4 text-4xl text-green-500" />
                            <h3 className="mb-2 text-xl font-semibold">Make an Impact</h3>
                            <p className="text-gray-600">
                                Turn your passion into action and contribute to a more regenerative world.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="py-20">
                <div className="container mx-auto max-w-3xl px-4">
                    <h2 className="mb-12 text-center text-3xl font-bold text-gray-800">Frequently Asked Questions</h2>
                    <Accordion type="single" collapsible>
                        {faqs.map((faq, index) => (
                            <AccordionItem key={index} value={`item-${index}`}>
                                <AccordionTrigger className="text-lg">{faq.question}</AccordionTrigger>
                                <AccordionContent className="text-base text-gray-700">{faq.answer}</AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t bg-white">
                <div className="container mx-auto px-4 py-6 text-center text-gray-600">
                    &copy; {new Date().getFullYear()} Kamooni. All rights reserved.
                </div>
            </footer>
        </div>
    );
};

export default WelcomePage;
