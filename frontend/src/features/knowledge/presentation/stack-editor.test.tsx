import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StackEditorView } from "./stack-editor";

describe("shared stack editor", () => {
    it("submits the trimmed name and description", async () => {
        const onSubmit = vi.fn(async () => undefined);
        render(
            <StackEditorView
                editing={false}
                initialName=""
                initialDescription=""
                onSubmit={onSubmit}
            />
        );

        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "  Practice mandate  " },
        });
        fireEvent.change(screen.getByLabelText("Description"), {
            target: { value: "  Temporary limits.  " },
        });
        fireEvent.click(screen.getByRole("button", { name: "Create stack" }));

        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                name: "Practice mandate",
                description: "Temporary limits.",
            })
        );
    });

    it("requires a name and keeps actionable errors in the shared form", async () => {
        const onSubmit = vi.fn(async () => {
            throw new Error("This workspace reached its stack limit.");
        });
        render(
            <StackEditorView
                editing
                initialName="Existing stack"
                initialDescription=""
                onSubmit={onSubmit}
            />
        );

        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "   " },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        expect(screen.getByText("A stack name is required.")).toBeTruthy();
        expect(onSubmit).not.toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Renamed stack" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await waitFor(() =>
            expect(
                screen.getByText("This workspace reached its stack limit.")
            ).toBeTruthy()
        );
    });

    it("blocks repeated submissions while one save is in flight", async () => {
        let resolve!: () => void;
        const onSubmit = vi.fn(
            () =>
                new Promise<void>((done) => {
                    resolve = done;
                })
        );
        render(
            <StackEditorView
                editing={false}
                initialName="New stack"
                initialDescription=""
                onSubmit={onSubmit}
            />
        );

        const submit = screen.getByRole("button", { name: "Create stack" });
        fireEvent.click(submit);
        fireEvent.click(submit);
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect((submit as HTMLButtonElement).disabled).toBe(true);
        resolve();
        await waitFor(() =>
            expect((submit as HTMLButtonElement).disabled).toBe(false)
        );
    });
});
