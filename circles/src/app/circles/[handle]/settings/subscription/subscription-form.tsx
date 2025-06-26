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
    const [plans, setPlans] = useState<Plan[]>([]);

    useEffect(() => {
        async function fetchPlans() {
            try {
                const plansData = await getPlans();
                setPlans(plansData);
            } catch (error) {
                console.error(error);
            }
        }

        fetchPlans();
    }, []);

    const handleSubscribe = async (planId: string) => {
        if (circle) {
            await createSubscription(circle._id!, planId);
        }
    };

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">Subscription</h1>
            <p className="mb-6 text-muted-foreground">
                Choose a plan to support the circle and get access to exclusive content.
            </p>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => (
                    <Card key={plan.id} className="flex flex-col">
                        <CardHeader>
                            <CardTitle>{plan.campaign.name}</CardTitle>
                            <CardDescription>
                                {plan.formatted_amount} / {plan.type}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow"></CardContent>
                        <div className="p-6 pt-0">
                            <Button onClick={() => handleSubscribe(plan.id)} className="w-full">
                                Subscribe
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
