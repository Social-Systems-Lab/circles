"use server";

import { ModuleLayoutPageProps } from "../dynamic-page-layout";
import { SettingsLayoutWrapper } from "./settings-layout-wrapper";

export default async function SettingsModuleLayout({ children, circle, page, isDefaultCircle }: ModuleLayoutPageProps) {
    return (
        <SettingsLayoutWrapper circle={circle} isDefaultCircle={isDefaultCircle}>
            {children}
        </SettingsLayoutWrapper>
    );
}
