import KamooniLandingPage from "@/components/pages/kamooni-landing-page";
import { getActiveBanner } from "@/lib/data/system-banners";
import { DEFAULT_WELCOME_BANNER_TEXT } from "@/config/platform-banner";

export const metadata = {
    title: "Welcome | Kamooni",
};

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
    const activeBanner = await getActiveBanner();

    return (
        <KamooniLandingPage
            variant="welcome"
            maintenanceMessage={DEFAULT_WELCOME_BANNER_TEXT}
            banner={
                activeBanner
                    ? {
                          type: activeBanner.type,
                          text: activeBanner.text,
                          ctaEnabled: activeBanner.ctaEnabled,
                          ctaLabel: activeBanner.ctaLabel,
                          ctaUrl: activeBanner.ctaUrl,
                      }
                    : null
            }
        />
    );
}
