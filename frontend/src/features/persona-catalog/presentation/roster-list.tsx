"use client";

/**
 * Roster presentation shared by the operator roster and the demo workspace.
 *
 * This module is data-shape agnostic: it receives already-decoded personas and
 * injected actions. It never imports a client, a hook, a route, or a store, so
 * a demo adapter can render exactly the same screen without live access.
 */
import Link from "next/link";
import {
    ArrowLeft,
    Bot,
    Copy,
    Loader2,
    MoreVertical,
    Plus,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface RosterPersonaView {
    id: string;
    name: string;
    subtitle?: string | null;
    color: string;
    activePrompt?: string | null;
    activePromptVersion?: number | null;
}

export interface RosterHrefs {
    home: string;
    create: string;
    persona: (personaId: string) => string;
}

export interface RosterListProps {
    personas: RosterPersonaView[];
    loading: boolean;
    error: string | null;
    hrefs: RosterHrefs;
    heading?: string;
    description?: string;
    highlightedPersonaId?: string;
    onDuplicate: (persona: RosterPersonaView) => void;
    onDelete: (personaId: string) => void;
}

export function RosterList({
    personas,
    loading,
    error,
    hrefs,
    heading = "AI Roster",
    description = "Manage your AI personas",
    highlightedPersonaId,
    onDuplicate,
    onDelete,
}: RosterListProps) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href={hrefs.home}
                            className="text-zinc-400 hover:text-white transition-colors"
                            aria-label="Back"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-white">{heading}</h1>
                            <p className="text-xs text-zinc-500">{description}</p>
                        </div>
                    </div>

                    <Link href={hrefs.create}>
                        <Button className="bg-emerald-600 hover:bg-emerald-700">
                            <Plus className="w-4 h-4 mr-2" />
                            Create Persona
                        </Button>
                    </Link>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 py-8">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-8">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                    </div>
                ) : personas.length === 0 ? (
                    <div className="text-center py-20">
                        <Bot className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
                        <h2 className="text-lg font-semibold text-white mb-2">
                            No Personas Yet
                        </h2>
                        <p className="text-zinc-400 text-sm mb-6">
                            Create your first AI persona to get started.
                        </p>
                        <Link href={hrefs.create}>
                            <Button className="bg-emerald-600 hover:bg-emerald-700">
                                <Plus className="w-4 h-4 mr-2" />
                                Create Persona
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <>
                        <h2 className="text-lg font-semibold text-white mb-4">
                            Your Personas ({personas.length})
                        </h2>

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {personas.map((persona) => (
                                <Card
                                    key={persona.id}
                                    className="bg-zinc-900/50 border-zinc-800 group"
                                >
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-10 h-10 rounded-full flex items-center justify-center"
                                                    style={{ backgroundColor: persona.color }}
                                                >
                                                    <Bot className="w-5 h-5 text-white" />
                                                </div>
                                                <div>
                                                    <Link href={hrefs.persona(persona.id)}>
                                                        <CardTitle className="text-white text-base hover:text-emerald-400 transition-colors cursor-pointer">
                                                            {persona.name}
                                                        </CardTitle>
                                                    </Link>
                                                    {persona.subtitle && (
                                                        <CardDescription
                                                            className="text-xs"
                                                            style={{ color: persona.color }}
                                                        >
                                                            {persona.subtitle}
                                                        </CardDescription>
                                                    )}
                                                    {highlightedPersonaId === persona.id && (
                                                        <span className="mt-1 inline-block rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                                                            Start here
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                        aria-label={`Actions for ${persona.name}`}
                                                    >
                                                        <MoreVertical className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="bg-zinc-800 border-zinc-700">
                                                    <DropdownMenuItem
                                                        onClick={() => onDuplicate(persona)}
                                                        className="text-zinc-300 focus:text-white"
                                                    >
                                                        <Copy className="w-4 h-4 mr-2" />
                                                        Duplicate
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => onDelete(persona.id)}
                                                        className="text-red-400 focus:text-red-300"
                                                    >
                                                        <Trash2 className="w-4 h-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-zinc-500 line-clamp-2">
                                            {persona.activePrompt
                                                ? persona.activePrompt.substring(0, 100) +
                                                  (persona.activePrompt.length > 100 ? "..." : "")
                                                : "No system prompt configured"}
                                        </p>
                                        {persona.activePromptVersion ? (
                                            <p className="text-xs text-zinc-600 mt-2">
                                                Prompt v{persona.activePromptVersion}
                                            </p>
                                        ) : null}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
