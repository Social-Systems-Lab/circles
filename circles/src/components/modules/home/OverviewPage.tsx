import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// TODO: Fetch and display live data for the circle overview.
// This could include recent posts, upcoming events, member count, etc.

export default function OverviewPage() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
                <p>
                    This is the overview page for members of the circle. It will display live data and summaries, such
                    as recent posts, upcoming events, active discussions, and other relevant information.
                </p>
                <p className="mt-4 text-muted-foreground">(Placeholder content - full implementation coming soon!)</p>
            </CardContent>
        </Card>
    );
}
