"use server";

import { ModuleLayoutPageProps } from "../dynamic-page-layout";
import { SettingsLayoutWrapper } from "./settings-layout-wrapper";

export default async function SettingsModuleLayout({ children, circle, page }: ModuleLayoutPageProps) {
    return <SettingsLayoutWrapper circle={circle}>{children}</SettingsLayoutWrapper>;
}
