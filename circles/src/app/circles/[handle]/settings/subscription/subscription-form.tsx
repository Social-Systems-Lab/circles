"use client";
import { useEffect, useState } from "react";
import Script from "next/script";
import { createSubscription } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Circle } from "@/models/models";

type Plan = {
    id: string;
    type: string;
    amount: string;
    formatted_amount: string;
    currency: string;
    interval: string;
    campaign: {
        name: string;
    };
    [key: string]: any;
};

export default function SubscriptionForm({ circle }: { circle: Circle }) {
    const [showDonorbox, setShowDonorbox] = useState(false);

    const foundingMemberPlan = {
        id: "the-founding-campaign?", // From the iframe src
        campaign: {
            name: "Founding Member",
        },
        formatted_amount: "55.77 kr",
        interval: "monthly",
    };

    const isMember = circle.subscription?.status === "active" || circle.manualMember;

    return (
        <div className="formatted container mx-auto py-12">
            <div className="text-center">
                <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">Become a Kamooni Member</h1>
                <p className="mt-6 text-lg leading-8 text-gray-600">
                    Support the development of Kamooni and get access to exclusive features.
                </p>
            </div>
            <div className="formatted mt-16 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-2">
                <Card className="flex flex-col rounded-3xl p-8">
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold">Free</CardTitle>
                        <CardDescription>$0 / forever</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-4">
                        <ul className="space-y-2">
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                Own your profile
                            </li>
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                Own your content
                            </li>
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                Own your network
                            </li>
                        </ul>
                    </CardContent>
                    <div className="p-6 pt-0">
                        <Button variant="outline" className="w-full">
                            Current Plan
                        </Button>
                    </div>
                </Card>
                <Card className="flex flex-col rounded-3xl bg-purple-50 p-8">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-2xl font-bold">{foundingMemberPlan.campaign.name}</CardTitle>
                            <img src="/images/member-badge.png" alt="Member Badge" className="h-8 w-8" />
                        </div>
                        <CardDescription>
                            {foundingMemberPlan.formatted_amount} / {foundingMemberPlan.interval}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-4">
                        <ul className="space-y-2">
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                All features from the Free plan
                            </li>
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                Verified Badge
                            </li>
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                Early access to new features
                            </li>
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                Direct support
                            </li>
                        </ul>
                    </CardContent>
                    <div className="p-6 pt-0">
                        {isMember ? (
                            <Button variant="outline" className="w-full" disabled>
                                Current Plan
                            </Button>
                        ) : (
                            <Dialog open={showDonorbox} onOpenChange={setShowDonorbox}>
                                <DialogTrigger asChild>
                                    <Button className="w-full bg-purple-600 text-white hover:bg-purple-700">
                                        Become a Member
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-lg">
                                    <DialogHeader>
                                        <DialogTitle>Become a Founding Member</DialogTitle>
                                    </DialogHeader>
                                    <div className="mt-4">
                                        <Script src="https://donorbox.org/widget.js" strategy="lazyOnload" />
                                        <iframe
                                            src={`https://donorbox.org/embed/${foundingMemberPlan.id}&email=${encodeURIComponent(
                                                circle.email!,
                                            )}&custom_fields[circleId]=${circle._id!}`}
                                            name="donorbox"
                                            allowpaymentrequest="allowpaymentrequest"
                                            seamless={true}
                                            frameBorder="0"
                                            scrolling="no"
                                            height="900px"
                                            width="100%"
                                            style={{
                                                maxWidth: "500px",
                                                minWidth: "250px",
                                                maxHeight: "none!important",
                                            }}
                                            allow="payment"
                                        ></iframe>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                </Card>
            </div>
            {isMember && (
                <div className="mt-16 text-center">
                    <h2 className="text-2xl font-bold">Your Current Plan</h2>
                    <p className="mt-4 text-lg">
                        You are a <span className="font-bold">Founding Member</span>.
                    </p>
                    <p className="mt-2 text-muted-foreground">Thank you for your support!</p>
                </div>
            )}
            <pre>{JSON.stringify(plans, null, 2)}</pre>
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
