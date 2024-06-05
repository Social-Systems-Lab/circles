"use client";

import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import { FaCircleCheck, FaCircleXmark } from "react-icons/fa6";

export function Toaster() {
    const { toasts } = useToast();

    return (
        <ToastProvider>
            {toasts.map(function ({ id, title, description, action, icon, ...props }) {
                return (
                    <Toast key={id} {...props}>
                        <div className="flex flex-row items-center justify-center gap-5">
                            {icon && (
                                <>
                                    {icon === "success" && <FaCircleCheck size="30px" color="#47db71" />}
                                    {icon === "error" && <FaCircleXmark size="30px" color="white" />}
                                </>
                            )}

                            <div className="grid gap-1">
                                {title && <ToastTitle>{title}</ToastTitle>}
                                {description && <ToastDescription>{description}</ToastDescription>}
                            </div>
                        </div>
                        {action}
                        <ToastClose />
                    </Toast>
                );
            })}
            <ToastViewport />
        </ToastProvider>
    );
}
