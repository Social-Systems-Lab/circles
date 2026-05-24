import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { isVerifiedUser } from "@/lib/auth/verification";
import type { Circle } from "@/models/models";
import { cn } from "@/lib/utils";

type UserStatusBadgeProps = {
    user: Pick<Circle, "circleType" | "isFoundingMember" | "foundingMemberNumber" | "isVerified" | "verificationStatus"> | null | undefined;
    className?: string;
};

export function UserStatusBadge({ user, className }: UserStatusBadgeProps) {
    if (!user || user.circleType !== "user") {
        return null;
    }

    const isFoundingMember = user.isFoundingMember === true;
    const isPlatformVerified = isVerifiedUser(user);

    if (isFoundingMember) {
        return (
            <span
                className={cn(
                    "inline-flex items-center rounded-full bg-[hsl(var(--founding-member-bg))] px-2 py-1 text-xs font-medium text-[hsl(var(--founding-member-foreground))]",
                    className,
                )}
            >
                <Image
                    src="/images/member-badge.png"
                    alt="Member Badge"
                    width={16}
                    height={16}
                    className="mr-1 h-4 w-4"
                />
                Founding Member
            </span>
        );
    }

    if (isPlatformVerified) {
        return (
            <Badge className={cn("border-transparent bg-[#f7c968] text-[#5f4214] hover:bg-[#f7c968] hover:text-[#5f4214]", className)}>
                Test pilot
            </Badge>
        );
    }

    return <Badge className={cn("border-slate-200 bg-slate-50 text-slate-700", className)}>Unverified</Badge>;
}
