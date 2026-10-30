import { OperatorAccessProvider } from '@/features/access';

export default function OperatorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <OperatorAccessProvider>{children}</OperatorAccessProvider>;
}
