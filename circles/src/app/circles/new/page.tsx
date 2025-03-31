import { Suspense } from "react";
import CircleWizard from "@/components/circle-wizard/circle-wizard";

export default function NewCirclePage() {
    return (
        <Suspense fallback={<div>Loading wizard...</div>}>
            <CircleWizard />
        </Suspense>
    );
}
