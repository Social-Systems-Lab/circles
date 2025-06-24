"use client";
import { useEffect, useState } from "react";
import { getPlans, createSubscription } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Circle } from "@/models/models";

type Plan = {
    id: string;
    name: string;
    amount: string;
    interval: string;
};

export default function SubscriptionForm({ circle }: { circle: Circle }) {
    const [plans, setPlans] = useState<Plan[]>([]);

    useEffect(() => {
        async function fetchPlans() {
            const plansData = await getPlans();
            setPlans(plansData);
        }

        fetchPlans();
    }, []);

    const handleSubscribe = async (planId: string) => {
        if (circle) {
            await createSubscription(circle._id!, planId);
        }
    };

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold">Subscription</h1>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => (
                    <Card key={plan.id}>
                        <CardHeader>
                            <CardTitle>{plan.name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold">
                                ${plan.amount} / {plan.interval}
                            </p>
                            <Button onClick={() => handleSubscribe(plan.id)} className="mt-4 w-full">
                                Subscribe
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
