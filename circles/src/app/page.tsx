import "@/components/pages/peerify-landing-page.css";
import PeerifyLandingPage from "@/components/pages/peerify-landing-page";
import { appConfig } from "@/config/app";
import { redirect } from "next/navigation";

export const metadata = {
    title: `${appConfig.name} — ${appConfig.tagline}`,
    description: appConfig.description,
};

export const dynamic = "force-dynamic";

export default async function Home() {
    if (process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true") {
        redirect("/holding");
    }

    return <PeerifyLandingPage />;
}
