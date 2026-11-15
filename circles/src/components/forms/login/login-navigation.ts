import type { FormSubmitResponse } from "@/models/models";

export function resolveLoginFormDestination(result: FormSubmitResponse): string {
    return typeof result.data?.redirectTo === "string" ? result.data.redirectTo : `/circles/${result.data.user.handle}`;
}
