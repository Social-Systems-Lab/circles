import DynamicForm from "@/components/forms/dynamic-form";
import { Suspense } from "react";

export default function Signup() {
    return (
        <div className="flex flex-1 items-start justify-center pt-[40px]">
            <Suspense fallback={<div></div>}>
                <DynamicForm formSchemaId="signup-form" />
            </Suspense>
        </div>
    );
}
