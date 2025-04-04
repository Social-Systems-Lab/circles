type LayoutProps = {
    children: React.ReactNode;
};

export default async function ProjectsLayout({ children }: LayoutProps) {
    // Simply return children as no specific layout wrapper is needed
    return <>{children}</>;
}
