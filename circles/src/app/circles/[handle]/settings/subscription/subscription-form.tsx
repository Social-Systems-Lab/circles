"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Circle } from "@/models/models";
import Image from "next/image";
import { useToast } from "@/components/ui/use-toast";

type MembershipPanel = "free" | "member" | null;

export default function SubscriptionForm({
    circle: user,
}: {
    circle: Circle;
    onDialogClose?: () => void;
}) {
    const { toast } = useToast();
    const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);
    const [isLoadingYearly, setIsLoadingYearly] = useState(false);
    const [isLoadingPortal, setIsLoadingPortal] = useState(false);
    const [openPanel, setOpenPanel] = useState<MembershipPanel>(null);

    const isMember = user.isMember;
    const membershipState = user.subscription?.membershipState;
    const canManageStripeMembership =
        user.subscription?.provider === "stripe" &&
        (membershipState === "active" || membershipState === "grace_period");

    async function startCheckout(interval: "month" | "year") {
        const setLoading = interval === "year" ? setIsLoadingYearly : setIsLoadingMonthly;
        setLoading(true);

        try {
            const response = await fetch("/api/stripe/create-checkout-session", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ interval }),
            });

            const data = await response.json();

            if (!response.ok || !data?.url) {
                throw new Error(data?.error || "Failed to start checkout");
            }

            window.location.href = data.url;
        } catch (error) {
            toast({
                title: error instanceof Error ? error.message : "Failed to start checkout",
                variant: "destructive",
            });
            setLoading(false);
        }
    }

    async function openPortal() {
        setIsLoadingPortal(true);

        try {
            const response = await fetch("/api/stripe/create-portal-session", {
                method: "POST",
            });

            const data = await response.json();

            if (!response.ok || !data?.url) {
                throw new Error(data?.error || "Failed to open billing portal");
            }

            window.location.href = data.url;
        } catch (error) {
            toast({
                title: error instanceof Error ? error.message : "Failed to open billing portal",
                variant: "destructive",
            });
            setIsLoadingPortal(false);
        }
    }

    return (
        <>
            <div className="formatted w-full">
                <div className="formatted mt-2 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-2">
                    <Card className="flex flex-col rounded-3xl p-4">
                        <CardHeader>
                            <CardTitle className="text-2xl font-bold">Free</CardTitle>
                            <CardDescription>€0 / forever</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-grow flex-col space-y-4">
                            <div className="space-y-4 text-left text-sm text-muted-foreground">
                                <p>Everything you need to contribute, connect, and be an active part of the Kamooni community.</p>
                                <p>You can also become a full member after volunteering for three months.</p>
                                <p>
                                    If demand is high, there may be a waiting list until enough members are available to
                                    support new free users.
                                </p>
                            </div>

                            <div className="mt-auto pt-2">
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => setOpenPanel("free")}
                                >
                                    Find out more
                                </Button>
                            </div>
                        </CardContent>

                        {!isMember && (
                            <div className="p-6 pt-0">
                                <Button variant="outline" className="w-full">
                                    Current Plan
                                </Button>
                            </div>
                        )}
                    </Card>

                    <Card className="relative flex flex-col rounded-3xl p-4">
                        <CardHeader>
                            <CardTitle className="text-2xl font-bold">Kamooni Membership</CardTitle>
                            <div className="absolute right-4 top-4">
                                <Image src="/images/member-badge.png" alt="Member Badge" width={32} height={32} />
                            </div>
                            <CardDescription>€5/month or €50/year</CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-grow flex-col space-y-4">
                            <div className="space-y-4 text-left text-sm text-muted-foreground">
                                <p>Members help sustain Kamooni and keep it open to others.</p>
                                <p>
                                    As a thank you, members receive a few extra benefits, can invite five friends, and are
                                    invited to join the member circle to help shape Kamooni.
                                </p>
                            </div>

                            {isMember && (
                                <div className="rounded-xl border bg-white p-3 text-sm text-muted-foreground">
                                    <div className="font-medium text-foreground">Membership active</div>
                                    {membershipState && <div className="mt-1">State: {membershipState.replace("_", " ")}</div>}
                                </div>
                            )}

                            <div className="mt-auto pt-2">
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => setOpenPanel("member")}
                                >
                                    Find out more
                                </Button>
                            </div>
                        </CardContent>

                        <div className="space-y-3 p-6 pt-0">
                            {canManageStripeMembership ? (
                                <Button variant="outline" className="w-full" onClick={openPortal} disabled={isLoadingPortal}>
                                    {isLoadingPortal ? "Opening portal..." : "Manage Membership"}
                                </Button>
                            ) : isMember ? (
                                <Button variant="outline" className="w-full" disabled>
                                    Membership Active
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        className="w-full bg-purple-600 text-white hover:bg-purple-700"
                                        onClick={() => startCheckout("month")}
                                        disabled={isLoadingMonthly || isLoadingYearly}
                                    >
                                        {isLoadingMonthly ? "Redirecting..." : "Join Monthly"}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => startCheckout("year")}
                                        disabled={isLoadingMonthly || isLoadingYearly}
                                    >
                                        {isLoadingYearly ? "Redirecting..." : "Join Yearly"}
                                    </Button>
                                </>
                            )}
                        </div>
                    </Card>
                </div>
            </div>

            <AnimatePresence>
                {openPanel && (
                    <motion.div
                        initial={{ x: "110%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "110%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed bottom-4 right-4 top-[64px] z-50 w-full overflow-hidden bg-white shadow-lg md:w-[400px] md:rounded-[15px]"
                    >
                        <div className="h-full overflow-y-auto p-6">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-2 top-2 rounded-full bg-gray-100"
                                onClick={() => setOpenPanel(null)}
                                aria-label="Close panel"
                            >
                                <X className="h-4 w-4" />
                            </Button>

                            {openPanel === "free" ? <FreeMembershipPanel /> : <MemberBenefitsPanel />}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

function FreeMembershipPanel() {
    return (
        <div className="space-y-4 pr-8">
            <h3 className="text-2xl font-bold text-foreground">How volunteering membership works</h3>
            <div className="space-y-4 text-sm text-muted-foreground">
                <p>
                    While Kamooni needs funding to stay open and accessible to as many people as possible, we also
                    want to recognise the important work volunteers do and the value this brings to everyone.
                </p>
                <p>
                    If you volunteer for at least five hours per month for three consecutive months, you will be
                    invited to join Kamooni as a member, with all the benefits that membership includes.
                </p>
                <p>
                    Volunteering membership is renewed monthly. Hours from one month cannot be carried over to the
                    next. However, if you fall short one month, we offer a grace period so you can make up the
                    missing hours the following month and keep your membership status.
                </p>
                <p>
                    Kamooni wants to recognise the contributions our volunteers make, and thank them in some small
                    way.
                </p>
            </div>
        </div>
    );
}

function MemberBenefitsPanel() {
    return (
        <div className="space-y-4 pr-8">
            <h3 className="text-2xl font-bold text-foreground">Why become a member</h3>
            <div className="space-y-4 text-sm text-muted-foreground">
                <p>Kamooni Membership helps keep the platform open, healthy, and available to others.</p>
                <div>
                    <p className="mb-3">As a thank you, members receive a few extra benefits. Members can:</p>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>invite five friends who can join right away, even if there is a waiting list</li>
                        <li>test new features before everyone else and help shape how they develop</li>
                        <li>vote on the Kamooni roadmap and suggest what to build or improve next</li>
                        <li>create independent community circles with more options</li>
                        <li>activate funding through their circles</li>
                        <li>help allocate any surplus Kamooni generates through their Altruistic Wallets</li>
                    </ul>
                </div>
                <p>
                    Over time, we hope to make these functions available to everyone. But until Kamooni can fully
                    sustain itself, we want to show our paying members a little extra appreciation.
                </p>
                <p>
                    Membership is not only about access. It is also a way to actively support the wider community
                    and make space for more people to take part.
                </p>
            </div>
        </div>
    );
}
