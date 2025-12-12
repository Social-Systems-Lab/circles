import KamooniLandingPage from "@/components/pages/kamooni-landing-page";

const defaultMaintenanceMessage = "Kamooni is being updated. Back online Monday 15 December";

export const metadata = {
    title: "Maintenance | Kamooni",
};

export default function HoldingPage() {
    const maintenanceMessage = process.env.NEXT_PUBLIC_MAINTENANCE_MESSAGE || defaultMaintenanceMessage;
    return <KamooniLandingPage variant="holding" maintenanceMessage={maintenanceMessage} />;
}
