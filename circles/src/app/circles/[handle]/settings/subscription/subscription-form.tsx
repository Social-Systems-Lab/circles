"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Circle } from "@/models/models";
import Image from "next/image";
import { useToast } from "@/components/ui/use-toast";

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
        <div className="formatted w-full">
            <div className="formatted mt-2 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-2">
                <Card className="flex flex-col rounded-3xl p-4">
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold">Free</CardTitle>
                        <CardDescription>€0 / forever</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-4">
                        <ul className="space-y-2 text-left">
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                Basic features
                            </li>
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                Verify your account to unlock access
                            </li>
                        </ul>
                    </CardContent>
                    {!isMember && (
                        <div className="p-6 pt-0">
                            <Button variant="outline" className="w-full">
                                Current Plan
                            </Button>
                        </div>
                    )}
                </Card>

                <Card className="relative flex flex-col rounded-3xl bg-purple-50 p-4">
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold">Kamooni Membership</CardTitle>
                        <div className="absolute right-4 top-4">
                            <Image src="/images/member-badge.png" alt="Member Badge" width={32} height={32} />
                        </div>
                        <CardDescription>€5/month or €50/year</CardDescription>
                    </CardHeader>

                    <CardContent className="flex-grow space-y-4">
                        <ul className="space-y-2 text-left">
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                All features from the Free plan
                            </li>
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                Member badge
                            </li>
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                Supports Kamooni development
                            </li>
                        </ul>

                        {isMember && (
                            <div className="rounded-xl border bg-white/70 p-3 text-sm text-muted-foreground">
                                <div className="font-medium text-foreground">Membership active</div>
                                {membershipState && <div className="mt-1">State: {membershipState.replace("_", " ")}</div>}
                            </div>
                        )}
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
    );
}

function CheckIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}
