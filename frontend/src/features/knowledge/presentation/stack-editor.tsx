"use client";

/**
 * Shared stack create/edit form (spec-25).
 *
 * Server or browser-memory state and navigation are injected by the composing
 * adapter, so the live and practice screens use the same form.
 */
import { useState } from "react";
import { AlertTriangle, Loader2, Save } from "lucide-react";
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
        <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
                <CardTitle className="text-white">
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
                            className="text-sm font-medium text-zinc-200"
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
                            className="text-sm font-medium text-zinc-200"
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
                        <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                            <AlertTriangle className="h-4 w-4" />
                            {submitError ?? error}
                        </div>
                    )}
                    <Button type="submit" disabled={busy}>
                        {busy ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-1 h-4 w-4" />
                        )}
                        {submitLabel ??
                            (editing ? "Save changes" : "Create stack")}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
