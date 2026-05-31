"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Circle } from "@/models/models";
import Image from "next/image";
import { useToast } from "@/components/ui/use-toast";

type MembershipPanel = "free" | "member" | null;
type SupporterTier = 1 | 2 | 5 | 10;

export default function SubscriptionForm({ circle: user }: { circle: Circle; onDialogClose?: () => void }) {
    const { toast } = useToast();
    const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);
    const [isLoadingPortal, setIsLoadingPortal] = useState(false);
    const [openPanel, setOpenPanel] = useState<MembershipPanel>(null);

    const isMember = user.isMember;
    const membershipState = user.subscription?.membershipState;
    const canManageStripeMembership =
        user.subscription?.provider === "stripe" &&
        (membershipState === "active" || membershipState === "grace_period");

    async function startCheckout(amount: SupporterTier) {
        setIsLoadingMonthly(true);

        try {
            const response = await fetch("/api/stripe/create-checkout-session", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ interval: "month", amount }),
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
            setIsLoadingMonthly(false);
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
                            <CardTitle className="text-2xl font-bold">Test Pilots</CardTitle>
                            <CardDescription>€0 / forever</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-grow flex-col space-y-4">
                            <div className="space-y-4 text-left text-sm text-muted-foreground">
                                <p>
                                    Everything you need to contribute, connect, and be an active part of the Kamooni
                                    community.
                                </p>
                                <p>
                                    Kamooni stays open because it is community-supported. Becoming a supporter is
                                    optional.
                                </p>
                                <p>
                                    Early users are joining as Test Pilots and helping us improve the platform together.
                                </p>
                            </div>

                            <div className="mt-auto pt-2">
                                <Button variant="outline" className="w-full" onClick={() => setOpenPanel("free")}>
                                    Find out more
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="relative flex flex-col rounded-3xl p-4">
                        <CardHeader>
                            <CardTitle className="text-2xl font-bold">Founding Supporters</CardTitle>
                            <div className="absolute right-4 top-4">
                                <Image src="/images/member-badge.png" alt="Supporter Badge" width={32} height={32} />
                            </div>
                            <CardDescription>From €1/month</CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-grow flex-col space-y-4">
                            <div className="space-y-4 text-left text-sm text-muted-foreground">
                                <p>Founding Supporters help sustain Kamooni and keep it open to others.</p>
                                <p>
                                    As a thank you, supporters receive a few extra benefits, can invite five friends if
                                    there is a queue, and are invited to join the Kamoonity circle and help shape
                                    Kamooni.
                                </p>
                            </div>

                            {isMember && (
                                <div className="rounded-xl border bg-white p-3 text-sm text-muted-foreground">
                                    <div className="font-medium text-foreground">Founding Supporter active</div>
                                    {membershipState && (
                                        <div className="mt-1">State: {membershipState.replace("_", " ")}</div>
                                    )}
                                </div>
                            )}

                            <div className="mt-auto pt-2">
                                <Button variant="outline" className="w-full" onClick={() => setOpenPanel("member")}>
                                    Find out more
                                </Button>
                            </div>
                        </CardContent>

                        <div className="space-y-3 p-6 pt-0">
                            {canManageStripeMembership ? (
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={openPortal}
                                    disabled={isLoadingPortal}
                                >
                                    {isLoadingPortal ? "Opening Stripe..." : "Manage or cancel Founding Supporter plan"}
                                </Button>
                            ) : isMember ? (
                                <Button variant="outline" className="w-full" disabled>
                                    Founding Supporter Active
                                </Button>
                            ) : null}
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

                            {openPanel === "free" ? (
                                <FreeMembershipPanel />
                            ) : (
                                <MemberBenefitsPanel
                                    canManageStripeMembership={canManageStripeMembership}
                                    isLoadingPortal={isLoadingPortal}
                                    isLoadingMonthly={isLoadingMonthly}
                                    onManageMembership={openPortal}
                                    onJoinMonthly={startCheckout}
                                />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

function FreeMembershipPanel() {
    return (
        <div className="space-y-5 pr-8">
            <h3 className="text-2xl font-bold text-foreground">How Test Pilots can become supporters</h3>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground">
                <p>
                    Kamooni needs funding to stay open and accessible to as many people as possible, and we also want to
                    recognise the value volunteers bring to the wider community.
                </p>
                <p>
                    <strong className="font-semibold text-foreground">
                        Volunteer for at least five hours per month for three consecutive months,
                    </strong>{" "}
                    and you will be invited to join Kamooni as a supporter, with all the benefits that supporting
                    includes.
                </p>
                <p>
                    <strong className="font-semibold text-foreground">Supporter status is renewed monthly.</strong>{" "}
                    Hours from one month cannot be carried over to the next. However, if you fall short one month, we
                    offer a grace period so you can make up the missing hours the following month and keep your
                    supporting status.
                </p>
                <p>
                    Kamooni wants to recognise the contributions our volunteers make, and thank them in some small way.
                </p>
            </div>
        </div>
    );
}

function MemberBenefitsPanel({
    canManageStripeMembership,
    isLoadingPortal,
    isLoadingMonthly,
    onManageMembership,
    onJoinMonthly,
}: {
    canManageStripeMembership: boolean;
    isLoadingPortal: boolean;
    isLoadingMonthly: boolean;
    onManageMembership: () => void;
    onJoinMonthly: (amount: SupporterTier) => void;
}) {
    return (
        <div className="space-y-5 pr-8">
            <h3 className="text-2xl font-bold text-foreground">Why become a Founding Supporter</h3>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground">
                <p>Supporting Kamooni helps keep the platform open, healthy, and available to others.</p>
                <div>
                    <p className="mb-3">
                        As a thank you, supporters receive a few extra benefits. Founding Supporters can:
                    </p>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>
                            invite <strong className="font-semibold text-foreground">five friends</strong> who can join
                            right away, even if there is a waiting list
                        </li>
                        <li>
                            <strong className="font-semibold text-foreground">test new features</strong> before everyone
                            else and help shape how they develop
                        </li>
                        <li>
                            <strong className="font-semibold text-foreground">vote on the Kamooni roadmap</strong> and
                            suggest what to build or improve next
                        </li>
                        <li>
                            create{" "}
                            <strong className="font-semibold text-foreground">independent community circles</strong>{" "}
                            with more options
                        </li>
                        <li>
                            <strong className="font-semibold text-foreground">activate funding options</strong> through
                            their circles
                        </li>
                        <li>
                            <strong className="font-semibold text-foreground">receive altruistic dividends</strong> from
                            any surplus Kamooni generates
                        </li>
                    </ul>
                </div>
                <div className="rounded-xl border bg-gray-50 p-4">
                    <p className="font-semibold text-foreground">Contribution options</p>
                    <div className="mt-4 space-y-3">
                        <Button
                            variant="outline"
                            className="w-full justify-between"
                            onClick={() => onJoinMonthly(1)}
                            disabled={isLoadingMonthly}
                        >
                            <span>€1 Seed Supporter</span>
                            <span>€1/month</span>
                        </Button>
                        <Button
                            variant="outline"
                            className="w-full justify-between"
                            onClick={() => onJoinMonthly(2)}
                            disabled={isLoadingMonthly}
                        >
                            <span>€2 Community Supporter</span>
                            <span>€2/month</span>
                        </Button>
                        <Button
                            variant="outline"
                            className="w-full justify-between"
                            onClick={() => onJoinMonthly(5)}
                            disabled={isLoadingMonthly}
                        >
                            <span>€5 Sustaining Supporter</span>
                            <span>€5/month</span>
                        </Button>
                        <Button
                            variant="outline"
                            className="w-full justify-between"
                            onClick={() => onJoinMonthly(10)}
                            disabled={isLoadingMonthly}
                        >
                            <span>€10 Founding Supporter</span>
                            <span>€10/month</span>
                        </Button>
                        <Button variant="outline" className="w-full justify-between" asChild>
                            <Link href="/donate">
                                <span>Own amount Custom Supporter</span>
                                <span>One-off donation</span>
                            </Link>
                        </Button>
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">
                        Own amount currently opens the existing one-off donation flow. Recurring supporter membership is
                        available for the fixed monthly tiers above.
                    </p>
                </div>
                <p>
                    Over time, we hope to make these functions available to everyone. But until Kamooni can fully
                    sustain itself, we want to show our supporters a little extra appreciation.
                </p>
                <p>
                    Being a supporter is not only about access. It is also a way to actively support the wider community
                    and make space for more people to take part.
                </p>
            </div>

            {canManageStripeMembership && (
                <div className="rounded-xl border bg-gray-50 p-4">
                    <div className="space-y-4">
                        <div>
                            <div className="font-semibold text-foreground">Founding Supporter active</div>
                            <div className="text-sm text-muted-foreground">
                                Update your plan, payment details, or cancel at any time in Stripe.
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={onManageMembership}
                            disabled={isLoadingPortal}
                        >
                            {isLoadingPortal ? "Opening..." : "Open Stripe settings"}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
