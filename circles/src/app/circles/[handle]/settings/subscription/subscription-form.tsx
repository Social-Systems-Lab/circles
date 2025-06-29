"use client";
import { useEffect, useState } from "react";
import { getPlans, createSubscription } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    const [plan, setPlan] = useState<Plan | null>(null);

    useEffect(() => {
        async function fetchPlan() {
            try {
                const plansData = await getPlans();
                if (plansData && plansData.length > 0) {
                    setPlan(plansData[0]);
                }
            } catch (error) {
                console.error(error);
            }
        }

        fetchPlan();
    }, []);

    const handleSubscribe = async () => {
        if (circle && plan) {
            await createSubscription(circle._id!, plan.id);
        }
    };

    const isMember = circle.subscription?.status === "active";

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">Membership</h1>
            {isMember ? (
                <div>
                    <p className="mb-6 text-muted-foreground">You are a member. Thank you for your support!</p>
                    <pre>{JSON.stringify(circle.subscription, null, 2)}</pre>
                </div>
            ) : (
                <div>
                    <p className="mb-6 text-muted-foreground">
                        Become a member to support the circle and get access to exclusive content.
                    </p>
                    {plan && (
                        <Card className="flex flex-col">
                            <CardHeader>
                                <CardTitle>{plan.campaign.name}</CardTitle>
                                <CardDescription>
                                    {plan.formatted_amount} / {plan.type}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex-grow"></CardContent>
                            <div className="p-6 pt-0">
                                <Button onClick={handleSubscribe} className="w-full">
                                    Become a Member
                                </Button>
                            </div>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
