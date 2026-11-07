import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/shell";

export default function DemoNotFound() {
    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title="Recorded page not found"
                description="This demo route does not exist. The recorded meeting and practice workspace are unchanged."
                backHref="/demo"
                backLabel="Back to the board"
            />
            <PageContainer>
                <EmptyState
                    title="Nothing is available here"
                    description="Return to the prepared board or choose a recorded destination."
                    action={
                        <Button asChild>
                            <Link href="/demo">Back to the board</Link>
                        </Button>
                    }
                    className="material-raised rounded-group"
                />
            </PageContainer>
        </main>
    );
}
