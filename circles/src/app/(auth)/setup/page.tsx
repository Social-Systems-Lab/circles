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
import { useState } from "react";
// import { atom, useAtom } from "jotai";

const setupDataSchema = z.object({
    openaiKey: z.string().trim(),
    mapboxKey: z.string().trim(),
});

type SetupData = z.infer<typeof setupDataSchema>;

//const setupDataAtom = atom<SetupData>({ openaiKey: "", mapboxKey: "" });

const openAIFormSchema = z.object({
    openaiKey: z.string().trim().min(8, { message: "Enter valid OpenAI API key" }),
});

type OpenAIFormType = z.infer<typeof openAIFormSchema>;

const mapboxFormSchema = z.object({
    mapboxKey: z.string().trim().min(8, { message: "Enter valid Mapbox API key" }),
});

type MapboxFormType = z.infer<typeof mapboxFormSchema>;

const steps = [
    { label: "Introduction", component: Welcome },
    { label: "OpenAI API key", component: OpenAIStepForm, isOptionalStep: true },
    { label: "Mapbox API key", component: MapboxStepForm },
];

export default function Setup() {
    const [data, setData] = useState<SetupData>({ openaiKey: "", mapboxKey: "" });

    return (
        <div className="flex flex-1 flex-row gap-0 h-full overflow-hidden">
            <div className="flex-1 flex flex-col justify-center items-center">
                <ScrollArea className="flex-1 w-full pl-4 pr-4">
                    <div className="flex flex-col items-center justify-center pt-10">
                        <h1 className="text-3xl font-bold pb-2">Home Server Setup</h1>
                        <p className="text-gray-500 pb-4">Configure home server to get started.</p>
                    </div>
                    <div className="flex flex-row justify-center items-center w-full">
                        <div className="flex-1 max-w-[600px]">
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
                                        <stepProps.component data={data} setData={setData} />
                                    </Step>
                                ))}
                                <MyStepperFooter />
                            </Stepper>
                        </div>
                    </div>
                </ScrollArea>
            </div>
            <div className="flex-1 bg-slate-200 mt-2 mr-2 mb-2 rounded-[20px] p-8">
                <pre>{JSON.stringify(data, null, 2)}</pre>
            </div>
        </div>
    );
}

function Welcome() {
    const { nextStep } = useStepper();

    const form = useForm();

    function onSubmit() {
        nextStep();
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="p-[8px]">
                    <p className="mt-0">Please take a moment to configure the home server.</p>
                    <StepperFormActions />
                </div>
            </form>
        </Form>
    );
}

type StepProps = {
    data: SetupData;
    setData: (data: SetupData) => void;
};

function OpenAIStepForm({ data, setData }: StepProps) {
    const { nextStep } = useStepper();

    const form = useForm<OpenAIFormType>({
        resolver: zodResolver(openAIFormSchema),
        defaultValues: {
            openaiKey: "",
        },
    });

    function onSubmit(values: OpenAIFormType) {
        setData({ ...data, openaiKey: values.openaiKey });
        nextStep();
        toast({
            title: "OpenAI key saved",
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
                                <FormDescription className="mt-0">Specify an OpenAI API key to enable the AI functionality on the platform.</FormDescription>
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
                    <StepperFormActions />
                </form>
            </Form>
        </div>
    );
}

function MapboxStepForm({ data, setData }: StepProps) {
    const { nextStep } = useStepper();

    const form = useForm<MapboxFormType>({
        resolver: zodResolver(mapboxFormSchema),
        defaultValues: {
            mapboxKey: "",
        },
    });

    function onSubmit(_data: MapboxFormType) {
        setData({ ...data, mapboxKey: _data.mapboxKey });
        nextStep();
        toast({
            title: "Second step submitted!",
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
                                <FormDescription className="mt-0">Specify a Mapbox API key to enable the map on the platform.</FormDescription>
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
                    <StepperFormActions />
                </form>
            </Form>
        </div>
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
