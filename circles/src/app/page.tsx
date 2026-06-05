import "@/components/pages/public-home-page.css";
import PublicHomePage from "@/components/pages/public-home-page";
import { redirect } from "next/navigation";

export default async function Home() {
    if (process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true") {
        redirect("/holding");
    }

    return <PublicHomePage />;
}
