import DynamicForm from "@/components/forms/dynamic-form";

export default async function Register() {
    return <DynamicForm initialFormData={{}} formSchemaId="register-form" />;
    // return <LoginForm loginData={loginData} />;
}
