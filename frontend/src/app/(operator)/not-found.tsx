import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/shell";

export default function OperatorNotFound() {
    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title="Page not found"
                description="This operator route does not exist. Existing meetings and workspace data are unchanged."
                backHref="/meetings"
                backLabel="Back to meetings"
            />
            <PageContainer>
                <EmptyState
                    title="Nothing is available here"
                    description="Choose a section from the navigation or return to the meeting list."
                    action={
                        <Button asChild>
                            <Link href="/meetings">Back to meetings</Link>
                        </Button>
                    }
                    className="material-raised rounded-group"
                />
            </PageContainer>
        </main>
    );
}
