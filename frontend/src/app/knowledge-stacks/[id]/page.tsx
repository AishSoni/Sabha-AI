'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Upload, BookOpen, Loader2, Trash2,
    FileText, Calendar, AlertCircle, CheckCircle, XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { knowledgeStacksApi, documentsApi, KnowledgeStack, Document } from '@/lib/api';

export default function KnowledgeStackDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const stackId = params.id as string;

    const [stack, setStack] = useState<KnowledgeStack | null>(null);
    const [documents, setDocuments] = useState<Document[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const [stackData, docsData] = await Promise.all([
                knowledgeStacksApi.getStack(stackId),
                documentsApi.listStackDocuments(stackId)
            ]);
            setStack(stackData);
            setDocuments(docsData);
            setError(null);

            // Check if any documents are processing
            const hasProcessing = docsData.some(d => d.status === 'processing');
            if (hasProcessing && !pollIntervalRef.current) {
                pollIntervalRef.current = setInterval(async () => {
                    try {
                        const newDocs = await documentsApi.listStackDocuments(stackId);
                        setDocuments(newDocs);
                        if (!newDocs.some(d => d.status === 'processing') && pollIntervalRef.current) {
                            clearInterval(pollIntervalRef.current);
                            pollIntervalRef.current = null;
                        }
                    } catch (e) {
                        console.error("Failed to poll documents", e);
                    }
                }, 3000);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load knowledge stack details');
        } finally {
            setIsLoading(false);
        }
    }, [stackId]);

    useEffect(() => {
        fetchData();
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [fetchData]);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setError(null);

        try {
            await documentsApi.uploadDocument(file, undefined, undefined, stackId);
            await fetchData(); // Refresh list immediately and start polling if needed
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload document');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDeleteDoc = async (documentId: string) => {
        if (!confirm('Delete this document?')) return;
        try {
            await documentsApi.deleteDocument(documentId);
            setDocuments(prev => prev.filter(d => d.id !== documentId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete document');
        }
    };

    if (isLoading && !stack) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!stack) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6 flex flex-col items-center justify-center text-center">
                <BookOpen className="w-12 h-12 text-zinc-600 mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">Stack Not Found</h2>
                <Button variant="outline" onClick={() => router.push('/knowledge-stacks')}>
                    Return to Knowledge Stacks
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            {/* Header */}
            <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/knowledge-stacks" className="text-zinc-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <div className="flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-blue-500" />
                                <h1 className="text-xl font-bold text-white">{stack.name}</h1>
                            </div>
                            <p className="text-xs text-zinc-500 truncate max-w-sm">{stack.description}</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6 py-8">
                {error && (
                    <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm flex gap-3 text-left">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <div>{error}</div>
                    </div>
                )}

                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-white">Documents ({documents.length})</h2>
                    <div className="flex gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <Button
                            onClick={handleUploadClick}
                            disabled={isUploading}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {isUploading ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Upload className="w-4 h-4 mr-2" />
                            )}
                            {isUploading ? 'Uploading...' : 'Upload Document'}
                        </Button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="py-20 text-center text-zinc-500">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                        <p>Loading documents...</p>
                    </div>
                ) : documents.length === 0 ? (
                    <div className="text-center py-20 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-xl">
                        <FileText className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
                        <h3 className="text-lg font-medium text-white mb-2">No documents yet</h3>
                        <p className="text-zinc-400 text-sm mb-6 max-w-md mx-auto">
                            Upload documents to this stack to make their content available to any AI persona using it.
                        </p>
                        <Button variant="outline" onClick={handleUploadClick} className="border-zinc-700">
                            <Upload className="w-4 h-4 mr-2" /> Select File
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {documents.map((doc) => (
                            <DocumentListCard key={doc.id} document={doc} onDelete={() => handleDeleteDoc(doc.id)} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

function DocumentListCard({ document, onDelete }: { document: Document, onDelete: () => void }) {
    const [isDeleting, setIsDeleting] = useState(false);

    const typeColors: Record<string, string> = {
        pdf: 'text-red-400 bg-red-900/20',
        xlsx: 'text-green-400 bg-green-900/20',
        xls: 'text-green-400 bg-green-900/20',
        csv: 'text-emerald-400 bg-emerald-900/20',
        md: 'text-blue-400 bg-blue-900/20',
        txt: 'text-zinc-400 bg-zinc-800',
        docx: 'text-blue-400 bg-blue-900/20',
    };

    const colorClass = typeColors[document.file_type] || typeColors.txt;

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await onDelete();
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Card className="bg-zinc-900/50 border-zinc-800 p-4 hover:border-zinc-700 transition-colors">
            <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClass} flex-shrink-0`}>
                    <FileText className="w-6 h-6" />
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-base font-medium text-white truncate mb-1" title={document.file_name}>
                        {document.file_name}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="uppercase border border-zinc-800 px-1.5 rounded bg-zinc-900 text-zinc-400">
                            {document.file_type}
                        </span>
                        <span>
                            {document.file_size_bytes < 1024 * 1024
                                ? `${(document.file_size_bytes / 1024).toFixed(1)} KB`
                                : `${(document.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`}
                        </span>
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(document.created_at).toLocaleDateString()}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {document.status === 'processing' && (
                        <Badge variant="secondary" className="bg-yellow-900/30 text-yellow-500 border-yellow-700/50">
                            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Processing
                        </Badge>
                    )}
                    {document.status === 'indexed' && (
                        <Badge variant="secondary" className="bg-green-900/30 text-green-500 border-green-700/50">
                            <CheckCircle className="w-3 h-3 mr-1.5" /> Indexed ({document.chunk_count} chunks)
                        </Badge>
                    )}
                    {document.status === 'failed' && (
                        <Badge variant="secondary" className="bg-red-900/30 text-red-500 border-red-700/50" title={document.error_message || "Error"}>
                            <XCircle className="w-3 h-3 mr-1.5" /> Failed
                        </Badge>
                    )}

                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-zinc-500 hover:text-red-400 hover:bg-red-950/30"
                        onClick={handleDelete}
                        disabled={isDeleting}
                    >
                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                </div>
            </div>
        </Card>
    );
}
