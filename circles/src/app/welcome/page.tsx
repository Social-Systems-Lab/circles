import "@/components/pages/peerify-landing-page.css";
import PeerifyLandingPage from "@/components/pages/peerify-landing-page";
import { appConfig } from "@/config/app";

export const metadata = {
    title: `Welcome | ${appConfig.name}`,
};

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
    return <PeerifyLandingPage />;
}
