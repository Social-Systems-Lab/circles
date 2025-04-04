// Removed DynamicPageLayout import

type LayoutProps = {
    // params are no longer needed as the wrapper is removed
    children: React.ReactNode;
};

export default async function CirclesLayout({ children }: LayoutProps) {
    // Simply return children as no specific layout wrapper is needed
    return <>{children}</>;
}
