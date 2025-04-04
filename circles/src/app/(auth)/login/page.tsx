import { LoginForm } from "@/components/forms/login/login-form"; // Import the new form

export default function Login() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-start pt-[10vh] md:pt-[20vh]">
            <div className="flex flex-col items-center justify-center border-0 pl-6 pr-6 pt-6 md:rounded-[15px] md:bg-white md:shadow-lg">
                <LoginForm />
            </div>
        </div>
    );
}
