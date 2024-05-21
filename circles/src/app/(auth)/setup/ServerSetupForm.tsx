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
import { handleSchema, passwordSchema } from "@/models/models";
import { useRef, useState, useTransition } from "react";
import { ServerSetupData, OpenAIFormType, MapboxFormType, mapboxFormSchema, openAIFormSchema } from "@/models/models";
import { saveMapboxKeyAction, saveOpenAIKeyAction, completeServerConfig } from "./actions";
import { useFormState } from "react-dom";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

const steps = [
    { label: "Introduction", component: WelcomeStep },
    { label: "AI config", component: OpenAIStepForm, optional: true },
    { label: "Map config", component: MapboxStepForm, optional: true },
    { label: "Complete", component: CompleteStep },
];

export default function ServerSetupForm({ setupData }: { setupData: ServerSetupData }) {
    const [data, setData] = useState<ServerSetupData>(setupData);
    const initialStep = !data.openaiKey ? 0 : !data.mapboxKey ? 2 : 3;

    return (
        <div className="flex flex-1 flex-row gap-0 h-full overflow-hidden">
            <div className="flex-1 flex flex-col justify-center items-center max-w-[650px]">
                <ScrollArea className="flex-1 w-full pl-8 pr-8">
                    <div className="flex flex-col items-center justify-center pt-[200px]">
                        <h1 className="text-3xl font-bold pb-2">Home Server Setup</h1>
                        <p className="text-gray-500 pb-4">Configure home server to get started.</p>
                    </div>
                    <div className="flex flex-row justify-center items-center w-full">
                        <div className="flex-1 max-w-[500px]">
                            <Stepper
                                variant="circle-alt"
                                initialStep={initialStep}
                                steps={steps}
                                orientation="horizontal"
                                onClickStep={(step, setStep) => {
                                    setStep(step);
                                }}
                                // styles={{
                                //     "step-button-container": cn(
                                //         "",
                                //         "data-[current=true]:border-[#8ddd84] data-[current=true]:bg-gray-50",
                                //         "data-[active=true]:bg-[#8ddd84] data-[active=true]:border-[#8ddd84]"
                                //     ),
                                //     "horizontal-step": "data-[completed=true]:[&:not(:last-child)]:after:bg-[#8ddd84]",
                                // }}
                                variables={{
                                    "--step-icon-size": "44px",
                                    "--step-gap": "0px",
                                }}
                                // #944eff #7171d7 #c578b1 #b72792 #ffac7c
                                // #86e375 #d49977 #e6465d #e59b67 #e69565
                                // #67bd62 #66a5e5 #8ddd84
                                // scrollTracking
                            >
                                {steps.map((stepProps, index) => (
                                    <Step key={stepProps.label} {...stepProps}>
                                        <div className="pt-4">
                                            <stepProps.component data={data} setData={setData} />
                                        </div>
                                    </Step>
                                ))}
                            </Stepper>
                        </div>
                    </div>
                </ScrollArea>
            </div>
            <div className="flex-1 bg-[#fdfdfd]  overflow-hidden relative">
                <Image src="/images/cover2.png" alt="" objectFit="cover" fill />
                {/* <div className="p-8">
                    <pre>{JSON.stringify(data, null, 2)}</pre>
                </div> */}
            </div>
        </div>
    );
}

function WelcomeStep() {
    const { nextStep } = useStepper();

    const form = useForm();

    function onSubmit() {
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

type StepProps = {
    data: ServerSetupData;
    setData: (data: ServerSetupData) => void;
};

function CompleteStep({ data, setData }: StepProps) {
    const { nextStep } = useStepper();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const form = useForm();

    function onSubmit() {
        startTransition(async () => {
            const response = await completeServerConfig();
            if (!response.success) {
                toast({
                    title: response.message,
                    variant: "destructive",
                });
                return;
            }
            router.push("/login");
        });
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="p-[8px]">
                    <p>
                        Press finish to complete the server setup and move on to creating an admin account.
                        {!data.openaiKey && (
                            <p className="text-red-400">
                                We highly recommend you specify a valid OpenAI key so the next stages in the setup process will be AI assisted.
                            </p>
                        )}
                    </p>
                    <StepperFormActions isPending={isPending} />
                </div>
            </form>
        </Form>
    );
}

function OpenAIStepForm({ data, setData }: StepProps) {
    const { nextStep } = useStepper();
    const [isPending, startTransition] = useTransition();

    const form = useForm<OpenAIFormType>({
        resolver: zodResolver(openAIFormSchema),
        defaultValues: {
            openaiKey: data.openaiKey,
        },
    });

    async function onSubmit(values: OpenAIFormType) {
        setData({ ...data, openaiKey: values.openaiKey });

        startTransition(async () => {
            const response = await saveOpenAIKeyAction(values);
            if (!response.success) {
                toast({
                    title: response.message,
                    variant: "destructive",
                });
                return;
            }

            nextStep();
            toast({
                title: response.message,
            });
        });
    }

    // form.handleSubmit(onSubmit)

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
                                    <a className="textLink" href="https://platform.openai.com/" target="_blank">
                                        platform.openai.com
                                    </a>
                                    .
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <StepperFormActions isPending={isPending} />
                </form>
            </Form>
        </div>
    );
}

function MapboxStepForm({ data, setData }: StepProps) {
    const { nextStep } = useStepper();
    const [isPending, startTransition] = useTransition();

    const form = useForm<MapboxFormType>({
        resolver: zodResolver(mapboxFormSchema),
        defaultValues: {
            mapboxKey: data.mapboxKey,
        },
    });

    async function onSubmit(values: MapboxFormType) {
        setData({ ...data, mapboxKey: values.mapboxKey });
        startTransition(async () => {
            const response = await saveMapboxKeyAction(values);
            if (!response.success) {
                toast({
                    title: response.message,
                    variant: "destructive",
                });
                return;
            }

            nextStep();
            toast({
                title: response.message,
            });
        });
    }

    return (
        <div className="p-[8px]">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="mapboxKey"
                        render={({ field }) => (
                            <FormItem>
                                <FormDescription>Specify a Mapbox API key to enable the map on the platform.</FormDescription>
                                <FormLabel>Mapbox API key</FormLabel>
                                <FormControl>
                                    <Input placeholder="" {...field} />
                                </FormControl>
                                <FormDescription>
                                    Create Mapbox API key at{" "}
                                    <a className="textLink" href="https://account.mapbox.com/access-tokens/" target="_blank">
                                        mapbox.com
                                    </a>
                                    .
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <StepperFormActions isPending={isPending} />
                </form>
            </Form>
        </div>
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
