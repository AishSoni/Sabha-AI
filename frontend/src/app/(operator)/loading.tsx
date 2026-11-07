import { LoadingState, PageContainer, PageHeader } from "@/components/shell";

export default function OperatorLoading() {
    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader title="Loading workspace" />
            <PageContainer>
                <LoadingState label="Loading operator workspace…" rows={4} />
            </PageContainer>
        </main>
    );
}
