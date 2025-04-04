import { SignupForm } from "@/components/forms/signup/signup-form"; // Import the new form

export default function Signup() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-start pt-[40px] md:pt-[60px]">
            <div className="flex w-full flex-col items-center justify-center border-0 px-6 pt-6 md:w-[450px] md:min-w-[450px] md:rounded-[15px] md:bg-white md:shadow-lg">
                <SignupForm />
            </div>
        </div>
    );
}
