'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, BookOpen, Loader2, MoreVertical, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { knowledgeStacksApi, KnowledgeStack } from '@/lib/api';

export default function KnowledgeStacksPage() {
    const [stacks, setStacks] = useState<KnowledgeStack[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadStacks();
    }, []);

    async function loadStacks() {
        try {
            setLoading(true);
            const response = await knowledgeStacksApi.listStacks();
            setStacks(response.stacks);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load knowledge stacks');
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(stackId: string) {
        if (!confirm('Are you sure you want to delete this knowledge stack?')) return;

        try {
            await knowledgeStacksApi.deleteStack(stackId);
            setStacks(stacks.filter(s => s.id !== stackId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete knowledge stack');
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            {/* Header */}
            <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-white">Knowledge Stacks</h1>
                            <p className="text-xs text-zinc-500">Manage document collections for RAG</p>
                        </div>
                    </div>

                    <Link href="/knowledge-stacks/new">
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="w-4 h-4 mr-2" />
                            Create Stack
                        </Button>
                    </Link>
                </div>
            </header>

            {/* Main Content */}
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
                ) : stacks.length === 0 ? (
                    <div className="text-center py-20">
                        <BookOpen className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
                        <h2 className="text-lg font-semibold text-white mb-2">No Knowledge Stacks Yet</h2>
                        <p className="text-zinc-400 text-sm mb-6">
                            Create your first knowledge stack to curate documents for your AI advisors.
                        </p>
                        <Link href="/knowledge-stacks/new">
                            <Button className="bg-blue-600 hover:bg-blue-700">
                                <Plus className="w-4 h-4 mr-2" />
                                Create Stack
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <>
                        <h2 className="text-lg font-semibold text-white mb-4">
                            Your Stacks ({stacks.length})
                        </h2>

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {stacks.map((stack) => (
                                <Card key={stack.id} className="bg-zinc-900/50 border-zinc-800 group">
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                                                    <BookOpen className="w-5 h-5 text-blue-400" />
                                                </div>
                                                <div>
                                                    <Link href={`/knowledge-stacks/${stack.id}`}>
                                                        <CardTitle className="text-white text-base hover:text-blue-400 transition-colors cursor-pointer">
                                                            {stack.name}
                                                        </CardTitle>
                                                    </Link>
                                                    <CardDescription className="text-xs text-zinc-500">
                                                        Created {new Date(stack.created_at).toLocaleDateString()}
                                                    </CardDescription>
                                                </div>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <MoreVertical className="w-4 h-4 text-zinc-400 hover:text-white" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="bg-zinc-800 border-zinc-700">
                                                    <DropdownMenuItem
                                                        onClick={() => handleDelete(stack.id)}
                                                        className="text-red-400 focus:text-red-300 cursor-pointer"
                                                    >
                                                        <Trash2 className="w-4 h-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-zinc-400 line-clamp-2">
                                            {stack.description || 'No description provided.'}
                                        </p>
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
