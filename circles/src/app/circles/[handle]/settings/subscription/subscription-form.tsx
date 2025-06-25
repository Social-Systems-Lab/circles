"use client";
import { useEffect, useState } from "react";
import { getPlans, createSubscription } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Circle } from "@/models/models";

type Plan = {
    id: string;
    name: string;
    amount: string;
    interval: string;
    description: string;
    currency: string;
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
        <div className="flex-1 p-8 pt-6">
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold">Subscription</h1>
                    <p className="text-muted-foreground">
                        Choose a plan to support the circle and get access to exclusive content.
                    </p>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {plans.map((plan) => (
                        <Card key={plan.id} className="flex flex-col">
                            <CardHeader>
                                <CardTitle>{plan.name}</CardTitle>
                                <CardDescription>{plan.name}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-grow">
                                <div className="flex items-baseline justify-center">
                                    <span className="text-4xl font-bold">
                                        {plan.currency &&
                                            new Intl.NumberFormat("en-US", {
                                                style: "currency",
                                                currency: plan.currency,
                                            }).format(parseFloat(plan.amount))}
                                    </span>
                                    <span className="ml-1 text-xl font-normal text-muted-foreground">
                                        /{plan.interval}
                                    </span>
                                </div>
                            </CardContent>
                            <div className="p-6 pt-0">
                                <Button onClick={() => handleSubscribe(plan.id)} className="w-full">
                                    Subscribe
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
