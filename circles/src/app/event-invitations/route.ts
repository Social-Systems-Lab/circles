import { guestInvitationPage, handleGuestInvitationRequest } from "./invitation-page";

export function GET() {
    return guestInvitationPage();
}

export function POST(request: Request) {
    return handleGuestInvitationRequest(request);
}
