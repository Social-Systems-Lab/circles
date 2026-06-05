import { Circle, UserPrivate } from "@/models/models";
import { sendNotifications } from "./notifications";
import { getUserPrivate } from "./user";
import { getCirclesByDids } from "./circle";

export async function sendVerificationRequestNotification(user: Circle, admins: UserPrivate[]): Promise<void> {
    try {
        console.log(`🔔 [NOTIFY] Sending user_verification_request to ${admins.length} admins`);
        await sendNotifications("user_verification_request", admins, {
            user,
            messageBody: `User ${user.name} (@${user.handle}) has requested account verification.`,
            url: `/admin?tab=users`,
        });
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in sendVerificationRequestNotification:", error);
    }
}
