"use client";

import { useState } from "react";
import { Circle } from "@/models/models";
import SubscriptionForm from "./subscription-form";

export default function SubscriptionFormSettings({ user }: { user: Circle }) {
    const [subscriptionAttempted, setSubscriptionAttempted] = useState(false);

    const handleDialogClose = () => {
        setSubscriptionAttempted(true);
    };

    if (subscriptionAttempted) {
        return (
            <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold">Thank You!</h1>
                <p className="mb-4">
                    Your subscription is being processed. Your membership status will be updated shortly.
                </p>
            </div>
        );
    }

    return <SubscriptionForm circle={user} onDialogClose={handleDialogClose} />;
}
