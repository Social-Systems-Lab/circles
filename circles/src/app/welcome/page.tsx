import KamooniLandingPage from "@/components/pages/kamooni-landing-page";

export const metadata = {
    title: "Welcome | Kamooni",
};

export default function WelcomePage() {
    const maintenanceMessage = process.env.NEXT_PUBLIC_MAINTENANCE_MESSAGE;
    return <KamooniLandingPage variant="welcome" maintenanceMessage={maintenanceMessage} />;
}
