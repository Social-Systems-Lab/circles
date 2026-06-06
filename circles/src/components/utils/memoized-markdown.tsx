import { memo } from "react";
import ReactMarkdown, { Options } from "react-markdown";

type MemoizedReactMarkdownProps = Options & {
    className?: string;
};

const ReactMarkdownWithClassName = ({ className, ...props }: MemoizedReactMarkdownProps) => {
    if (!className) {
        return <ReactMarkdown {...props} />;
    }

    return (
        <div className={className}>
            <ReactMarkdown {...props} />
        </div>
    );
};

export const MemoizedReactMarkdown = memo(
    ReactMarkdownWithClassName,
    (prevProps, nextProps) => prevProps.children === nextProps.children && prevProps.className === nextProps.className,
);
