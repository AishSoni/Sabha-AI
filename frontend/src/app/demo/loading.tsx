import { LoadingState, PageContainer, PageHeader } from "@/components/shell";

export default function DemoLoading() {
    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title="Loading recorded demo"
                meta={
                    <span className="type-meta text-ink-muted">
                        Recorded demo
                    </span>
                }
            />
            <PageContainer>
                <LoadingState label="Loading recorded demo…" rows={4} />
            </PageContainer>
        </main>
    );
}
