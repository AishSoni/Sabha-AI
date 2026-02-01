'use client';

import { useMeetingStore } from '@/stores/meetingStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Upload, FolderOpen, Calendar } from 'lucide-react';

// Mock shared documents for now - will be replaced with real data from backend
const MOCK_SHARED_DOCUMENTS = [
    {
        id: '1',
        name: 'Company_Strategy_2026.pdf',
        type: 'pdf',
        size: '2.4 MB',
        uploadedAt: '2026-01-30T10:00:00Z',
    },
    {
        id: '2',
        name: 'Product_Roadmap.xlsx',
        type: 'xlsx',
        size: '1.1 MB',
        uploadedAt: '2026-01-29T15:30:00Z',
    },
    {
        id: '3',
        name: 'Meeting_Context_Notes.md',
        type: 'md',
        size: '45 KB',
        uploadedAt: '2026-01-28T09:15:00Z',
    },
];

export function SharedDocumentsTab() {
    const { currentMeeting } = useMeetingStore();

    // For now, show mock data. Set to empty array to show empty state
    const documents = MOCK_SHARED_DOCUMENTS;

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
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-zinc-700 text-zinc-400 hover:text-white"
                            disabled
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            Upload
                            <Badge variant="secondary" className="ml-2 text-xs bg-zinc-800 text-zinc-500">
                                Soon
                            </Badge>
                        </Button>
                    </div>
                    <p className="text-sm text-zinc-400">
                        Documents in this collection are accessible to all AI participants during the meeting.
                    </p>
                </div>

                {documents.length === 0 ? (
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
                            disabled
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            Upload Documents
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {documents.map((doc) => (
                            <DocumentCard key={doc.id} document={doc} />
                        ))}
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}

interface DocumentCardProps {
    document: {
        id: string;
        name: string;
        type: string;
        size: string;
        uploadedAt: string;
    };
}

function DocumentCard({ document }: DocumentCardProps) {
    const typeColors: Record<string, string> = {
        pdf: 'text-red-400 bg-red-900/20',
        xlsx: 'text-green-400 bg-green-900/20',
        xls: 'text-green-400 bg-green-900/20',
        csv: 'text-emerald-400 bg-emerald-900/20',
        md: 'text-blue-400 bg-blue-900/20',
        txt: 'text-zinc-400 bg-zinc-800',
    };

    const colorClass = typeColors[document.type] || typeColors.txt;

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    return (
        <Card className="bg-zinc-900/50 border-zinc-800 p-3 hover:bg-zinc-800/50 transition-colors">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
                    <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{document.name}</p>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span>{document.size}</span>
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(document.uploadedAt)}
                        </span>
                    </div>
                </div>
                <Badge variant="outline" className="text-xs text-zinc-400 border-zinc-700 uppercase">
                    {document.type}
                </Badge>
            </div>
        </Card>
    );
}
