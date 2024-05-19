"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { handleSchema, passwordSchema } from "@/models/models";

const registerFormZodSchema = z
    .object({
        email: z.string().email({
            message: "Enter valid email",
        }),
        handle: handleSchema,
        password: passwordSchema,
        confirmPassword: z.string(),
        type: z.enum(["user", "organization"]),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

type RegisterFormType = z.infer<typeof registerFormZodSchema>;

export default function Login() {
    const form = useForm<RegisterFormType>({
        resolver: zodResolver(registerFormZodSchema),
        defaultValues: {
            email: "",
            handle: "",
            password: "",
            confirmPassword: "",
            type: "user",
        },
    });

    function onSubmit(values: RegisterFormType) {
        // Do something with the form values.
        // ✅ This will be type-safe and validated.
        console.log(values);
    }

    return (
        <div className="flex flex-1 flex-row justify-center items-center">
            <div className="flex-1 max-w-[400px]">
                <h1 className="text-3xl font-bold pb-2">Register</h1>
                <p className="text-gray-500 pb-4">Create an account to get started.</p>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input placeholder="email" {...field} autoFocus />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="handle"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Handle</FormLabel>
                                    <FormControl>
                                        <Input placeholder="handle" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        Choose a unique handle that will identify you on the platform, e.g. <i>my_username_123</i>.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Account Type</FormLabel>

                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select account type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="user">Personal</SelectItem>
                                            <SelectItem value="organization">Organization</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Password</FormLabel>
                                    <FormControl>
                                        <Input placeholder="" type="password" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="confirmPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Confirm Password</FormLabel>
                                    <FormControl>
                                        <Input placeholder="" type="password" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button className="w-full" type="submit">
                            Register
                        </Button>
                        <p>
                            Already have an account? <Link href="/login">Log in</Link>
                        </p>
                    </form>
                </Form>
            </div>
        </div>
    );
}
