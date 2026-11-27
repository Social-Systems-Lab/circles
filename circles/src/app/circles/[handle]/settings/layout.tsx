import { getCircleSettingsAccess } from "../circle-page-access";
import { toSettingsNavigationDto } from "@/lib/data/settings-navigation-dto";
import { notFound } from "next/navigation";
import { SettingsLayoutWrapper } from "./settings-layout-wrapper";

type LayoutProps = {
    params: Promise<{ handle: string }>;
    children: React.ReactNode;
};

export default async function SettingsLayout({ params, children }: LayoutProps) {
    const p = await params;
    const access = await getCircleSettingsAccess(p.handle);
    if (!access) notFound();
    if (access.delegatedAboutEditor) return <>{children}</>;
    const { circle } = access;
    const navigation = toSettingsNavigationDto(circle);

    return <SettingsLayoutWrapper navigation={navigation}>{children}</SettingsLayoutWrapper>;
}
