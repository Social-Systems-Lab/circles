import DynamicForm from "@/components/forms/dynamic-form";

export default async function Signup() {
    return (
        <div className="flex flex-1 items-start justify-center pt-[40px]">
            <DynamicForm formSchemaId="signup-form" />
        </div>
    );
}
