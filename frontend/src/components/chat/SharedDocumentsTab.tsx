'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useMeetingStore } from '@/stores/meetingStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Upload, FolderOpen, Calendar, Trash2, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { documentsApi, Document } from '@/lib/api';

export function SharedDocumentsTab() {
    const { currentMeeting } = useMeetingStore();
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchDocuments = useCallback(async () => {
        if (!currentMeeting?.id) return;

        try {
            const docs = await documentsApi.listMeetingDocuments(currentMeeting.id);
            setDocuments(docs);
            setError(null);

            // If any documents are still processing, continue polling
            const hasProcessing = docs.some(d => d.status === 'processing');
            if (hasProcessing && !pollIntervalRef.current) {
                pollIntervalRef.current = setInterval(fetchDocuments, 3000);
            } else if (!hasProcessing && pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load documents');
        } finally {
            setIsLoading(false);
        }
    }, [currentMeeting?.id]);

    useEffect(() => {
        fetchDocuments();
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, [fetchDocuments]);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentMeeting?.id) return;

        setIsUploading(true);
        setError(null);

        try {
            await documentsApi.uploadDocument(file, currentMeeting.id);
            // Start polling for status updates
            fetchDocuments();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload document');
        } finally {
            setIsUploading(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDelete = async (documentId: string) => {
        try {
            await documentsApi.deleteDocument(documentId);
            setDocuments(prev => prev.filter(d => d.id !== documentId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete document');
        }
    };

    if (!currentMeeting) {
        return (
            <div className="flex items-center justify-center h-full text-zinc-500">
                No meeting selected
            </div>
        );
    }

    return (
        <ScrollArea className="h-full p-4">
            <div className="max-w-3xl mx-auto">
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-lg font-semibold text-white">Shared Documents</h3>
                        <div className="flex items-center gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-zinc-700 text-zinc-400 hover:text-white"
                                onClick={handleUploadClick}
                                disabled={isUploading}
                            >
                                {isUploading ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Upload className="w-4 h-4 mr-2" />
                                )}
                                {isUploading ? 'Uploading...' : 'Upload'}
                            </Button>
                        </div>
                    </div>
                    <p className="text-sm text-zinc-400">
                        Documents in this collection are accessible to all AI participants during the meeting.
                    </p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {isLoading ? (
                    <div className="text-center py-16 text-zinc-500">
                        <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" />
                        <p className="text-sm">Loading documents...</p>
                    </div>
                ) : documents.length === 0 ? (
                    <div className="text-center py-16 text-zinc-500">
                        <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <h3 className="text-lg font-medium text-zinc-400 mb-1">No Shared Documents</h3>
                        <p className="text-sm mb-4">
                            Upload documents to share context with all AI participants.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-zinc-700 text-zinc-400"
                            onClick={handleUploadClick}
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            Upload Documents
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {documents.map((doc) => (
                            <DocumentCard
                                key={doc.id}
                                document={doc}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}

interface DocumentCardProps {
    document: Document;
    onDelete: (id: string) => void;
}

function DocumentCard({ document, onDelete }: DocumentCardProps) {
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

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        await onDelete(document.id);
        setIsDeleting(false);
    };

    const StatusBadge = () => {
        switch (document.status) {
            case 'processing':
                return (
                    <Badge variant="secondary" className="text-xs bg-yellow-900/30 text-yellow-400 border-yellow-700">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Processing
                    </Badge>
                );
            case 'indexed':
                return (
                    <Badge variant="secondary" className="text-xs bg-green-900/30 text-green-400 border-green-700">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Indexed ({document.chunk_count} chunks)
                    </Badge>
                );
            case 'failed':
                return (
                    <Badge variant="secondary" className="text-xs bg-red-900/30 text-red-400 border-red-700" title={document.error_message || 'Unknown error'}>
                        <XCircle className="w-3 h-3 mr-1" />
                        Failed
                    </Badge>
                );
            default:
                return null;
        }
    };

    return (
        <Card className="bg-zinc-900/50 border-zinc-800 p-3 hover:bg-zinc-800/50 transition-colors">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
                    <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{document.file_name}</p>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span>{formatSize(document.file_size_bytes)}</span>
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(document.created_at)}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <StatusBadge />
                    <Badge variant="outline" className="text-xs text-zinc-400 border-zinc-700 uppercase">
                        {document.file_type}
                    </Badge>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-zinc-500 hover:text-red-400 p-1 h-auto"
                        onClick={handleDelete}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Trash2 className="w-4 h-4" />
                        )}
                    </Button>
                </div>
            </div>
        </Card>
    );
}
