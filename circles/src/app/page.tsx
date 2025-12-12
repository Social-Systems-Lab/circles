import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

export default async function Home() {
    if (process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true") {
        redirect("/holding");
    }

    const userDid = await getAuthenticatedUserDid();

    if (!userDid) {
        redirect("/welcome");
    }

    redirect("/explore");
}
