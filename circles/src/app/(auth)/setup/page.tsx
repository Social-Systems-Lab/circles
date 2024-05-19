"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Step, Stepper, useStepper } from "@/components/stepper";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import Link from "next/link";
import { handleSchema, passwordSchema } from "@/models/models";

const setupServerFormSchema = z.object({
    openaiKey: z.string(),
    mapboxKey: z.string(),
});

type SetupServerFormType = z.infer<typeof setupServerFormSchema>;

const openAIFormSchema = z.object({
    openaiKey: z.string().min(8, { message: "Enter valid OpenAI API key" }),
});

type OpenAIFormType = z.infer<typeof openAIFormSchema>;

const mapboxFormSchema = z.object({
    mapboxKey: z.string().min(8, { message: "Enter valid Mapbox API key" }),
});

type MapboxFormType = z.infer<typeof mapboxFormSchema>;

const steps = [
    { label: "Introduction", component: Welcome },
    { label: "OpenAI API key", component: OpenAIStepForm, isOptionalStep: true },
    { label: "Mapbox API key", component: MapboxStepForm },
];

export default function Setup() {
    const form = useForm<SetupServerFormType>({
        resolver: zodResolver(setupServerFormSchema),
        defaultValues: {
            openaiKey: "",
            mapboxKey: "",
        },
    });

    function onSubmit(values: SetupServerFormType) {
        // Do something with the form values.
        // ✅ This will be type-safe and validated.
        console.log(values);
    }

    return (
        <div className="flex flex-1 flex-row justify-center items-center">
            <div className="flex-1 max-w-[500px]">
                <h1 className="text-3xl font-bold pb-2">Home Server Setup</h1>
                <p className="text-gray-500 pb-4">Configure home server to get started.</p>
                <div className="hidden">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                            <FormField
                                control={form.control}
                                name="openaiKey"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>OpenAI API key</FormLabel>
                                        <FormControl>
                                            <Input placeholder="" {...field} autoFocus />
                                        </FormControl>
                                        <FormDescription>
                                            Create OpenAI API key at{" "}
                                            <a href="https://platform.openai.com/" target="_blank">
                                                platform.openai.com
                                            </a>
                                            .
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="mapboxKey"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Mapbox API key</FormLabel>
                                        <FormControl>
                                            <Input placeholder="" {...field} />
                                        </FormControl>
                                        <FormDescription>
                                            Create Mapbox API key at{" "}
                                            <a href="https://account.mapbox.com/access-tokens/" target="_blank">
                                                mapbox.com
                                            </a>
                                            .
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Button className="w-full" type="submit">
                                Save
                            </Button>
                        </form>
                    </Form>
                </div>
                <Stepper
                    variant="circle-alt"
                    initialStep={0}
                    steps={steps}
                    orientation="vertical"
                    onClickStep={(step, setStep) => {
                        setStep(step);
                    }}
                    scrollTracking
                >
                    {steps.map((stepProps, index) => (
                        <Step key={stepProps.label} {...stepProps}>
                            <stepProps.component />
                        </Step>
                    ))}
                    <MyStepperFooter />
                </Stepper>
            </div>
        </div>
    );
}

function Welcome() {
    const { nextStep } = useStepper();

    const form = useForm();

    function onSubmit() {
        toast({
            title: "First step submitted!",
        });
        nextStep();
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="p-[8px]">
                    <p>Please take a moment to configure the home server.</p>
                    <StepperFormActions />
                </div>
            </form>
        </Form>
    );
}

function OpenAIStepForm() {
    const { nextStep } = useStepper();

    const form = useForm<OpenAIFormType>({
        resolver: zodResolver(openAIFormSchema),
        defaultValues: {
            openaiKey: "",
        },
    });

    function onSubmit(_data: OpenAIFormType) {
        nextStep();
        toast({
            title: "First step submitted!",
        });
    }

    return (
        <div className="p-[8px]">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="openaiKey"
                        render={({ field }) => (
                            <FormItem>
                                <FormDescription>Specify an OpenAI API key to enable the AI functionality on the platform.</FormDescription>
                                <FormLabel>OpenAI API key</FormLabel>
                                <FormControl>
                                    <Input placeholder="" {...field} autoFocus />
                                </FormControl>
                                <FormDescription>
                                    Create OpenAI API key at{" "}
                                    <a href="https://platform.openai.com/" target="_blank">
                                        platform.openai.com
                                    </a>
                                    .
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <StepperFormActions />
                </form>
            </Form>
        </div>
    );
}

function MapboxStepForm() {
    const { nextStep } = useStepper();

    const form = useForm<MapboxFormType>({
        resolver: zodResolver(mapboxFormSchema),
        defaultValues: {
            mapboxKey: "",
        },
    });

    function onSubmit(_data: MapboxFormType) {
        nextStep();
        toast({
            title: "Second step submitted!",
        });
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="mapboxKey"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                                <Input type="password" {...field} />
                            </FormControl>
                            <FormDescription>This is your private password.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <StepperFormActions />
            </form>
        </Form>
    );
}

function StepperFormActions() {
    const { prevStep, resetSteps, isDisabledStep, hasCompletedAllSteps, isLastStep, isOptionalStep } = useStepper();

    return (
        <div className="w-full flex justify-end gap-2">
            {hasCompletedAllSteps ? (
                <Button size="sm" onClick={resetSteps}>
                    Reset
                </Button>
            ) : (
                <>
                    <Button disabled={isDisabledStep} onClick={prevStep} size="sm" variant="secondary">
                        Prev
                    </Button>
                    <Button size="sm">{isLastStep ? "Finish" : isOptionalStep ? "Skip" : "Next"}</Button>
                </>
            )}
        </div>
    );
}

function MyStepperFooter() {
    const { activeStep, resetSteps, steps } = useStepper();

    if (activeStep !== steps.length) {
        return null;
    }

    return (
        <div className="flex items-center justify-end gap-2">
            <Button onClick={resetSteps}>Reset Stepper with Form</Button>
        </div>
    );
}
