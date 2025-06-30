"use client";
import { useEffect, useState } from "react";
import Script from "next/script";
import { createSubscription } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Circle } from "@/models/models";
import Image from "next/image";

export default function SubscriptionForm({ circle: user }: { circle: Circle }) {
    const [showDonorbox, setShowDonorbox] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const foundingMemberPlan = {
        id: "the-founding-campaign?", // From the iframe src
        campaign: {
            name: "Founding Member",
        },
        formatted_amount: "$1+",
        interval: "monthly",
    };

    const isMember = user.isMember;

    const handleManageSubscription = () => {
        const donorboxDonorId = user?.subscription?.donorboxDonorId;
        console.log(JSON.stringify(user?.subscription, null, 2));
        if (donorboxDonorId) {
            window.open(`https://donorbox.org/user_session/new?donor_id=${donorboxDonorId}`, "_blank");
        }
    };

    return (
        <div className="formatted container mx-auto">
            <div className="formatted mt-2 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-2">
                <Card className="flex flex-col rounded-3xl p-4">
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold">Free</CardTitle>
                        <CardDescription>$0 / forever</CardDescription>
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
                        <CardTitle className="text-2xl font-bold">Founding Member</CardTitle>
                        <div className="absolute right-4 top-4">
                            <Image src="/images/member-badge.png" alt="Member Badge" width={32} height={32} />
                        </div>
                        <CardDescription>Donate monthly ($1 or more)</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-4">
                        <ul className="space-y-2 text-left">
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                All features from the Free plan
                            </li>
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                Founder Badge
                            </li>
                            <li className="flex items-center">
                                <CheckIcon className="mr-2 h-5 w-5 text-green-500" />
                                Early access to new features
                            </li>
                        </ul>
                    </CardContent>
                    <div className="p-6 pt-0">
                        {isMember ? (
                            <Button variant="outline" className="w-full" onClick={handleManageSubscription}>
                                Manage Subscription
                            </Button>
                        ) : (
                            <Dialog open={showDonorbox} onOpenChange={setShowDonorbox}>
                                <DialogTrigger asChild>
                                    <Button className="w-full bg-purple-600 text-white hover:bg-purple-700">
                                        Become a Member
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="z-[600] max-w-lg">
                                    <DialogHeader>
                                        <DialogTitle>Become a Founding Member</DialogTitle>
                                    </DialogHeader>
                                    <div className="mt-4">
                                        <Script src="https://donorbox.org/widget.js" strategy="lazyOnload" />
                                        <iframe
                                            src={`https://donorbox.org/embed/${foundingMemberPlan.id}&email=${encodeURIComponent(
                                                user.email!,
                                            )}&custom_fields[circleId]=${user._id!}`}
                                            name="donorbox"
                                            allowFullScreen
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
            {/* {isMember && (
                <div className="mt-16 text-center">
                    <h2 className="text-2xl font-bold">Your Current Plan</h2>
                    <p className="mt-4 text-lg">
                        You are a <span className="font-bold">Founding Member</span>.
                    </p>
                    <p className="mt-2 text-muted-foreground">Thank you for your support!</p>
                </div>
            )} */}
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
