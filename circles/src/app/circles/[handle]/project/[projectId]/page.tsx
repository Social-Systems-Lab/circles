// /src/app/circles/[handle]/project/[projectId]/page.tsx
import { getCircleByHandle, getCircleById } from "@/lib/data/circle";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Circle } from "@/models/models";
import Image from "next/image";
import RichText from "@/components/modules/feeds/RichText";

type SingleProjectPageProps = {
    params: Promise<{ handle: string; projectId: string }>;
};

export default async function SingleProjectPage(props: SingleProjectPageProps) {
    const params = await props.params;
    const userDid = await getAuthenticatedUserDid();
    let projectId = params.projectId;
    let handle = params.handle;

    if (!userDid) {
        redirect("/unauthenticated");
    }

    // Get the parent circle by handle
    const parentCircle = await getCircleByHandle(handle);
    if (!parentCircle) {
        redirect("/not-found");
    }

    // Get the project by ID
    const project = await getCircleById(projectId);
    if (!project || project.circleType !== "project") {
        redirect("/not-found");
    }

    return (
        <div className="flex flex-1 flex-col">
            <div className="mb-4 mt-14 flex max-w-[1100px] flex-1 flex-col items-center justify-center md:ml-4 md:mr-4 md:mt-14">
                <div className="w-full max-w-[800px]">
                    <Link href={`/circles/${handle}/projects`}>
                        <Button variant="ghost" className="mb-4">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to projects
                        </Button>
                    </Link>

                    <div className="w-full overflow-hidden rounded-lg bg-white shadow">
                        <div className="p-6 pb-3">
                            <h1 className="text-2xl font-bold">{project.name}</h1>
                            {project.description && <p className="mt-2 text-gray-700">{project.description}</p>}
                        </div>

                        {/* Thinner cover image */}
                        <div className="relative h-[200px] w-full">
                            <Image
                                src={project.cover?.url ?? "/images/default-cover.png"}
                                alt="Project Cover"
                                style={{ objectFit: "cover" }}
                                fill
                                sizes="(max-width: 800px) 100vw, 800px"
                                priority
                            />
                        </div>

                        {/* Project content as rich text */}
                        {project.content && (
                            <div className="mt-4 px-6 pb-6 pt-2">
                                <div className="mb-2 text-lg font-semibold">Project Details</div>
                                <div className="prose prose-sm max-w-none">
                                    <RichText content={project.content} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
