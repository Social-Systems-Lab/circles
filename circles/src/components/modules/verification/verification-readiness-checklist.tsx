import { CheckCircle2, Circle as CircleIcon } from "lucide-react";
import type { VerificationReadiness } from "@/lib/verification-readiness";

export function VerificationReadinessChecklist({
    readiness,
}: {
    readiness: VerificationReadiness;
}) {
    return (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="font-medium">{readiness.title}</div>
            <ul className="space-y-2">
                {readiness.items.map((item) => (
                    <li key={item.key} className="flex items-start gap-2">
                        {item.complete ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                            <CircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                        )}
                        <span>{item.label}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
