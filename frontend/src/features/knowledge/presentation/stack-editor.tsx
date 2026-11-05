"use client";

/**
 * Shared stack create/edit form (spec-25).
 *
 * Server or browser-memory state and navigation are injected by the composing
 * adapter, so the live and practice screens use the same form.
 */
import { useState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface StackEditorViewProps {
    editing: boolean;
    initialName: string;
    initialDescription: string;
    saving?: boolean;
    error?: string | null;
    title?: string;
    description?: string;
    submitLabel?: string;
    onSubmit: (input: {
        name: string;
        description: string;
    }) => Promise<void> | void;
}

export function StackEditorView({
    editing,
    initialName,
    initialDescription,
    saving = false,
    error,
    title,
    description,
    submitLabel,
    onSubmit,
}: StackEditorViewProps) {
    const [name, setName] = useState(initialName);
    const [descriptionValue, setDescriptionValue] = useState(initialDescription);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setSubmitError(null);
        if (!name.trim()) {
            setSubmitError("A stack name is required.");
            return;
        }
        setSubmitting(true);
        try {
            await onSubmit({
                name: name.trim(),
                description: descriptionValue.trim(),
            });
        } catch (cause) {
            setSubmitError(
                cause instanceof Error
                    ? cause.message
                    : "The stack could not be saved."
            );
        } finally {
            setSubmitting(false);
        }
    }

    const busy = saving || submitting;

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    {title ?? (editing ? "Edit Stack" : "New Knowledge Stack")}
                </CardTitle>
                <CardDescription>
                    {description ??
                        "Stack contents stay live: participants assigned to this stack see its currently eligible documents."}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form
                    className="space-y-4"
                    onSubmit={(event) => void handleSubmit(event)}
                >
                    <div className="space-y-2">
                        <label
                            htmlFor="stack-name"
                            className="type-control font-medium text-ink"
                        >
                            Name
                        </label>
                        <Input
                            id="stack-name"
                            value={name}
                            maxLength={100}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="e.g. Market research"
                        />
                    </div>
                    <div className="space-y-2">
                        <label
                            htmlFor="stack-description"
                            className="type-control font-medium text-ink"
                        >
                            Description
                        </label>
                        <Textarea
                            id="stack-description"
                            value={descriptionValue}
                            onChange={(event) =>
                                setDescriptionValue(event.target.value)
                            }
                            placeholder="What belongs in this stack?"
                            rows={4}
                        />
                    </div>
                    {(submitError || error) && (
                        <div role="alert" className="flex items-center gap-2 rounded-control border border-danger/40 bg-danger-soft px-3 py-2 type-body text-danger">
                            <AlertTriangle className="size-4" />
                            {submitError ?? error}
                        </div>
                    )}
                    <Button type="submit" busy={busy} busyLabel="Saving stack">
                        <Save className="mr-1 size-4" />
                        {submitLabel ??
                            (editing ? "Save changes" : "Create stack")}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
