"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Step, Stepper, useStepper } from "@/components/stepper";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { EmailFormType, LoginData, PasswordFormType, emailFormSchema, handleSchema, passwordFormSchema, passwordSchema } from "@/models/models";
import { useRef, useState, useTransition } from "react";
import { ServerSetupData, OpenAIFormType, MapboxFormType, mapboxFormSchema, openAIFormSchema } from "@/models/models";
import { useFormState } from "react-dom";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Loader2, ShieldQuestion } from "lucide-react";
import { useRouter } from "next/navigation";
import { checkIfAccountExists, login } from "./actions";

type Step = {
    label: string;
    component: React.ComponentType<StepProps>;
    optional?: boolean;
    icon?: React.ComponentType;
};

const initialSteps: Step[] = [
    { label: "Email", component: EmailStep },
    { label: "", component: EmailStep, icon: ShieldQuestion },
    // { label: "AI config", component: OpenAIStepForm, optional: true },
    // { label: "Map config", component: MapboxStepForm, optional: true },
    // { label: "Complete", component: CompleteStep },
];

const loginSteps: Step[] = [
    { label: "Email", component: EmailStep },
    { label: "Password", component: PasswordStep },
];

const registerSteps: Step[] = [
    { label: "Email", component: EmailStep },
    { label: "Register", component: RegisterStep },
];

export default function LoginForm({ loginData }: { loginData: LoginData }) {
    const [data, setData] = useState<LoginData>(loginData);
    const [steps, setSteps] = useState<Step[]>(initialSteps);

    return (
        <div className="flex flex-1 flex-row gap-0 h-full overflow-hidden">
            <div className="flex-1 flex flex-col justify-center items-center max-w-[650px]">
                <ScrollArea className="flex-1 w-full pl-8 pr-8">
                    <div className="flex flex-col items-center justify-center pt-[200px]">
                        <h1 className="m-0 p-0 text-3xl font-bold pb-8">Welcome</h1>
                    </div>
                    <div className="flex flex-row justify-center items-center w-full">
                        <div className="flex flex-col flex-1 max-w-[500px] justify-center items-center">
                            <Stepper
                                variant="circle-alt"
                                initialStep={0}
                                steps={steps}
                                orientation="horizontal"
                                // onClickStep={(step, setStep) => {
                                //     setStep(step);
                                // }}
                                variables={{
                                    "--step-icon-size": "44px",
                                    "--step-gap": "0px",
                                }}
                            >
                                {steps.map((stepProps, index) => (
                                    <Step key={stepProps.label} {...stepProps}>
                                        <div className="pt-4">
                                            <stepProps.component data={data} setData={setData} setSteps={setSteps} />
                                        </div>
                                    </Step>
                                ))}
                            </Stepper>
                        </div>
                    </div>
                </ScrollArea>
            </div>
            <div className="flex-1 bg-[#fdfdfd]  overflow-hidden relative">
                {/* <Image src="/images/cover2.png" alt="" objectFit="cover" fill /> */}
                <div className="p-8">
                    <pre>{JSON.stringify(data, null, 2)}</pre>
                </div>
            </div>
        </div>
    );
}

type StepProps = {
    data: LoginData;
    setData: (data: LoginData) => void;
    setSteps: (steps: Step[]) => void;
};

function EmailStep({ data, setData, setSteps }: StepProps) {
    const { nextStep } = useStepper();
    const [isPending, startTransition] = useTransition();

    const form = useForm<EmailFormType>({
        resolver: zodResolver(emailFormSchema),
        defaultValues: {
            email: data.email,
        },
    });

    async function onSubmit(values: EmailFormType) {
        setData({ ...data, email: values.email });

        startTransition(async () => {
            const response = await checkIfAccountExists(values);
            if (!response.success) {
                toast({
                    title: response.message,
                    variant: "destructive",
                });
                return;
            }

            if (response.accountExists) {
                setSteps(loginSteps);
            } else {
                setSteps(registerSteps);
            }

            nextStep();
        });
    }

    return (
        <div className="p-[8px]">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <p>Please enter your email to log in or create a new account.</p>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                    <Input placeholder="" {...field} autoFocus />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="w-full flex justify-end gap-2 pt-4">
                        <Button className="min-w-[125px]" size="sm" disabled={isPending}>
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Checking...
                                </>
                            ) : (
                                <>Next</>
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );

    // <Button size="sm" className="w-[80px]">
    //     Next
    // </Button>
}

function PasswordStep({ data, setData, setSteps }: StepProps) {
    const { nextStep } = useStepper();
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const form = useForm<PasswordFormType>({
        resolver: zodResolver(passwordFormSchema),
        defaultValues: {
            password: data.password,
        },
    });

    async function onSubmit(values: PasswordFormType) {
        setData({ ...data, password: values.password });

        startTransition(async () => {
            const response = await login(values);
            if (!response.success) {
                toast({
                    title: response.message,
                    variant: "destructive",
                });
                return;
            }

            // if in setup mode we want to go straight to circle creation step
            router.push("/");
        });
    }

    return (
        <div className="p-[8px]">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                                <p>
                                    Account <b>{data.email}</b> exists. Please enter password to log in.
                                </p>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                    <Input placeholder="" {...field} autoFocus />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="w-full flex justify-end gap-2 pt-4">
                        <Button className="min-w-[125px]" size="sm" disabled={isPending}>
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Checking...
                                </>
                            ) : (
                                <>Log in</>
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}

function RegisterStep({ data, setData }: StepProps) {
    const { nextStep } = useStepper();

    const form = useForm();

    function onSubmit() {
        nextStep();
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="p-[8px]">
                    <p>
                        Account <b>{data.email}</b> does not exist. Please fill out the form to register a new account.
                    </p>
                    <StepperFormActions />
                </div>
            </form>
        </Form>
    );
}

function StepperFormActions({ isPending }: { isPending?: boolean }) {
    const { prevStep, nextStep, resetSteps, isDisabledStep, hasCompletedAllSteps, isLastStep, isOptionalStep } = useStepper();

    return (
        <div className="w-full flex justify-end gap-2 pt-4">
            {hasCompletedAllSteps ? (
                <Button size="sm" onClick={resetSteps} disabled={isPending}>
                    Reset
                </Button>
            ) : (
                <>
                    <Button disabled={isDisabledStep || isPending} size="sm" onClick={prevStep} variant="secondary" className="w-[80px]">
                        Prev
                    </Button>
                    {isOptionalStep && (
                        <Button className="w-[80px]" size="sm" onClick={nextStep} variant="secondary" disabled={isPending}>
                            Skip
                        </Button>
                    )}
                    <Button className="min-w-[125px]" size="sm" disabled={isPending}>
                        {isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>{isLastStep ? "Finish" : "Next"}</>
                        )}
                    </Button>
                </>
            )}
        </div>
    );
}
