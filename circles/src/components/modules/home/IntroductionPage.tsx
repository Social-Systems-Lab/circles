import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// TODO: Fetch and display actual introduction content for the circle.
// This content should be customizable by circle admins.

export default function IntroductionPage() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Introduction</CardTitle>
            </CardHeader>
            <CardContent>
                <p>
                    This is the introduction page for the circle. Circle admins will be able to customize this content
                    to explain the purpose of the circle, welcome new members, and provide important information.
                </p>
                <p className="mt-4 text-muted-foreground">(Placeholder content - full implementation coming soon!)</p>
            </CardContent>
        </Card>
    );
}
