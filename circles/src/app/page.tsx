import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

export default async function Home() {
    const userDid = await getAuthenticatedUserDid();

    if (!userDid) {
        redirect("/welcome");
    } else {
        redirect("/explore");
    }

    return null;
}
