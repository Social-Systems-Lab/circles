import { Suspense } from "react";
import DynamicForm from "@/components/forms/dynamic-form";

type NewCircleProps = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function NewCirclePage(props: NewCircleProps) {
    const searchParams = await props.searchParams;

  return (
    <Suspense fallback={<div>Loading form...</div>}>
        <div className="pt-4">
            <DynamicForm
                formSchemaId="create-circle-form"
                initialFormData={{ parentCircleId: searchParams?.parentCircleId as string }}
                maxWidth="600px"
            />
        </div>
    </Suspense>
  );
}
