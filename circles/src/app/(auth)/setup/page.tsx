"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { handleSchema, passwordSchema } from "@/models/models";

const setupServerFormSchema = z.object({
    openaiKey: z.string(),
    mapboxKey: z.string(),
});

type SetupServerFormType = z.infer<typeof setupServerFormSchema>;

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
            <div className="flex-1 max-w-[400px]">
                <h1 className="text-3xl font-bold pb-2">Home Server Setup</h1>
                <p className="text-gray-500 pb-4">Configure home server to get started.</p>
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
        </div>
    );
}
