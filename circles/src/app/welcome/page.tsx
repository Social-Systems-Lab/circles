import "@/components/pages/peerify-landing-page.css";
import PeerifyLandingPage from "@/components/pages/peerify-landing-page";
import { getActiveBanner } from "@/lib/data/system-banners";

export const metadata = {
    title: "Welcome | Peerify",
};

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
    await getActiveBanner();
    return <PeerifyLandingPage />;
}
