'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { knowledgeStacksApi, KnowledgeStackCreate } from '@/lib/api';

export default function NewKnowledgeStackPage() {
    const router = useRouter();
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [stack, setStack] = useState<KnowledgeStackCreate>({
        name: '',
        description: '',
    });

    const handleCreate = async () => {
        if (!stack.name.trim()) return;

        try {
            setCreating(true);
            setError(null);
            await knowledgeStacksApi.createStack(stack);
            router.push('/knowledge-stacks');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create knowledge stack');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            {/* Header */}
            <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/knowledge-stacks" className="text-zinc-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-white">Create Knowledge Stack</h1>
                            <p className="text-xs text-zinc-500">Define a new collection for RAG</p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-4xl mx-auto px-6 py-8">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-8">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                )}

                <div className="grid lg:grid-cols-2 gap-8">
                    {/* Left Column - Main Form */}
                    <div className="space-y-8">
                        {/* Preview Card */}
                        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
                            <div className="h-2 bg-blue-500" />
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                        <BookOpen className="w-6 h-6 text-blue-400" />
                                    </div>
                                    <div className="flex-1">
                                        <h2 className="text-xl font-bold text-white">
                                            {stack.name || 'Stack Name'}
                                        </h2>
                                        <p className="text-sm text-zinc-500 line-clamp-2">
                                            {stack.description || 'Description'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Name Input */}
                        <section className="space-y-3">
                            <Label htmlFor="name" className="text-lg font-semibold text-white">
                                Name <span className="text-red-400">*</span>
                            </Label>
                            <Input
                                id="name"
                                placeholder="e.g., Q3 Financial Reports"
                                value={stack.name}
                                onChange={(e) => setStack({ ...stack, name: e.target.value })}
                                className="bg-zinc-900 border-zinc-700 text-white text-lg h-12"
                            />
                        </section>

                        {/* Description */}
                        <section className="space-y-3">
                            <Label htmlFor="description" className="text-lg font-semibold text-white">
                                Description
                            </Label>
                            <Textarea
                                id="description"
                                placeholder="What kind of documents will this stack contain?"
                                value={stack.description || ''}
                                onChange={(e) => setStack({ ...stack, description: e.target.value })}
                                className="bg-zinc-900 border-zinc-700 text-white min-h-[120px]"
                            />
                        </section>
                    </div>

                    {/* Right Column - Info */}
                    <div className="lg:self-start">
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardContent className="p-6 space-y-4">
                                <h3 className="text-lg font-semibold text-white">About Knowledge Stacks</h3>
                                <p className="text-sm text-zinc-400">
                                    Knowledge Stacks let you organize reference documents into thematic collections.
                                </p>
                                <ul className="text-sm text-zinc-500 space-y-2 list-disc pl-4">
                                    <li>Upload PDFs, text files, and markdown documents</li>
                                    <li>Assign stacks to your AI personas for tailored expertise</li>
                                    <li>Search across selected domains instantly</li>
                                </ul>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-12 flex items-center justify-end gap-4 border-t border-zinc-800 pt-8">
                    <Button
                        variant="ghost"
                        onClick={() => router.back()}
                        className="text-zinc-400"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={!stack.name.trim() || creating}
                        className="bg-blue-600 hover:bg-blue-700 px-8"
                    >
                        {creating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            'Create Stack'
                        )}
                    </Button>
                </div>
            </main>
        </div>
    );
}
