import { redirect } from "next/navigation";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { DmTopicComposer } from "@/components/modules/chat/dm-topic-composer";

export default async function NewDmPage({
    params,
    searchParams,
}: {
    params: Promise<{ recipientDid: string }>;
    searchParams: Promise<{ capability?: string }>;
}) {
    if (!(await getAuthenticatedUserDid())) redirect("/welcome");
    const { recipientDid } = await params;
    const { capability } = await searchParams;
    return <DmTopicComposer recipientDid={decodeURIComponent(recipientDid)} profileCapability={capability} />;
}
