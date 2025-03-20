// /src/app/circles/[handle]/project/[projectId]/page.tsx
import { getCircleByHandle, getCircleById } from "@/lib/data/circle";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Circle } from "@/models/models";

type SingleProjectPageProps = {
  params: Promise<{ handle: string; projectId: string }>;
};

export default async function SingleProjectPage(props: SingleProjectPageProps) {
  const params = await props.params;
  const userDid = await getAuthenticatedUserDid();
  let projectId = params.projectId;
  let handle = params.handle;
  
  console.log("handle", handle, "projectId", projectId);

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
  
  console.log(`Single project view: ${projectId} in circle: ${parentCircle.name}`);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 mt-14 flex max-w-[1100px] flex-1 flex-col items-center justify-center md:ml-4 md:mr-4 md:mt-14">
        <div className="w-full max-w-[600px]">
          <Link href={`/circles/${handle}/projects`}>
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to projects
            </Button>
          </Link>
          
          <div className="w-full bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            {project.description && (
              <p className="text-gray-700 mt-2">{project.description}</p>
            )}
            {project.content && (
              <div className="mt-4 pt-4 border-t">
                <h3 className="text-lg font-semibold mb-2">Project Details</h3>
                <p className="text-gray-800">{project.content}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}