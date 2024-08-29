import DynamicForm from "@/components/forms/dynamic-form";

export default function Login() {
    return (
        <div className="flex flex-1 items-start justify-center pt-[40px]">
            <DynamicForm formSchemaId="login-form" />
        </div>
    );
}
