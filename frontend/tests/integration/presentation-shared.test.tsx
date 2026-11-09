// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
    RosterList,
    type RosterPersonaView,
} from "@/features/persona-catalog/presentation";
import {
    DocumentPanelView,
    StackListView,
    UploadProgressView,
} from "@/features/knowledge/presentation";

const persona: RosterPersonaView = {
    id: "persona-credit",
    name: "Mira",
    subtitle: "Credit Analyst",
    color: "#2563eb",
    activePrompt: "Ground every claim in the issuer evidence.",
    activePromptVersion: 3,
};

describe("shared feature presentations", () => {
    it("renders the roster from injected data and actions", () => {
        const duplicate = vi.fn();
        const remove = vi.fn();
        render(
            <RosterList
                personas={[persona]}
                loading={false}
                error={null}
                hrefs={{
                    home: "/",
                    create: "/roster/new",
                    persona: (id) => `/roster/${id}`,
                }}
                onDuplicate={duplicate}
                onDelete={remove}
            />
        );

        expect(screen.getByText("Mira")).toBeInTheDocument();
        expect(screen.getByText("Prompt v3")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Create Persona/i })).toHaveAttribute(
            "href",
            "/roster/new"
        );
    });

    it("renders document state and routes injected actions", () => {
        const retry = vi.fn();
        const remove = vi.fn();
        render(
            <DocumentPanelView
                scopeLabel="workspace"
                documents={[
                    {
                        id: "doc-ready",
                        file_name: "fact-sheet.md",
                        file_type: "md",
                        file_size_bytes: 2048,
                        status: "ready",
                        chunk_count: 4,
                    },
                    {
                        id: "doc-failed",
                        file_name: "retry.csv",
                        file_type: "csv",
                        file_size_bytes: 512,
                        status: "failed",
                        chunk_count: 0,
                        operation_id: "op-1",
                        error_message: "Parser stopped",
                    },
                ]}
                isLoading={false}
                isError={false}
                uploading={false}
                onUploadFile={() => undefined}
                onRetry={retry}
                onDelete={remove}
            />
        );

        expect(screen.getByText("fact-sheet.md")).toBeInTheDocument();
        expect(screen.getByText(/Ready \(4 chunks\)/)).toBeInTheDocument();
        expect(screen.getByText(/Parser stopped/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Retry retry.csv" }));
        expect(retry).toHaveBeenCalledWith("op-1");
        fireEvent.click(screen.getByRole("button", { name: "Delete retry.csv" }));
        expect(remove).toHaveBeenCalledWith(
            expect.objectContaining({ id: "doc-failed" })
        );
    });

    it("renders upload progress and stack collections from injected state", () => {
        const retry = vi.fn();
        const remove = vi.fn();
        render(
            <>
                <UploadProgressView
                    operationId="op-2"
                    fileName="notes.md"
                    progress={{
                        state: "failed",
                        chunkCount: 0,
                        errorMessage: "Indexing failed",
                    }}
                    onRetry={retry}
                />
                <StackListView
                    stacks={[
                        {
                            id: "stack-1",
                            name: "Issuer fact sheet",
                            description: "Shared reference material",
                        },
                    ]}
                    isLoading={false}
                    isError={false}
                    hrefs={{
                        createStack: "/demo/knowledge-stacks/new",
                        stack: (id) => `/demo/knowledge-stacks/${id}`,
                    }}
                    onDelete={remove}
                />
            </>
        );

        expect(screen.getByText("Indexing failed")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Retry ingestion" }));
        expect(retry).toHaveBeenCalledWith("op-2");

        expect(screen.getByText("Issuer fact sheet")).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /Open →/ })
        ).toHaveAttribute("href", "/demo/knowledge-stacks/stack-1");
        fireEvent.click(
            screen.getByRole("button", { name: "Delete Issuer fact sheet" })
        );
        expect(remove).toHaveBeenCalledWith("stack-1");
    });
});
