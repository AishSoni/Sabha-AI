import { describe, expect, it } from 'vitest';
import { decodeIngestionProgress, decodeUploadReceipt } from './decoders';

describe('upload receipt decoding', () => {
    it('accepts a pending receipt only with a durable operation id', () => {
        const receipt = decodeUploadReceipt(
            {
                state: 'pending',
                documentId: 'doc-1',
                operationId: 'op-1',
                revisionId: null,
                file_name: 'market.pdf',
                status: 'processing',
                chunk_count: 0,
                message: 'queued',
            },
            '/documents/upload',
        );

        expect(receipt.state).toBe('pending');
        expect(receipt.operationId).toBe('op-1');
        expect(receipt.revisionId).toBeNull();
    });

    it('rejects a pending receipt that would force the client to guess an operation', () => {
        expect(() =>
            decodeUploadReceipt(
                {
                    state: 'pending',
                    documentId: 'doc-1',
                    operationId: null,
                    revisionId: null,
                    file_name: 'market.pdf',
                    status: 'processing',
                    chunk_count: 0,
                    message: 'queued',
                },
                '/documents/upload',
            ),
        ).toThrow(/durable operation id/);
    });

    it('accepts ready only with a published revision', () => {
        const receipt = decodeUploadReceipt(
            {
                state: 'ready',
                documentId: 'doc-1',
                operationId: null,
                revisionId: 'rev-1',
                file_name: 'market.pdf',
                status: 'ready',
                chunk_count: 4,
                message: 'ready',
            },
            '/documents/upload',
        );

        expect(receipt.state).toBe('ready');
        expect(receipt.revisionId).toBe('rev-1');
        expect(receipt.chunk_count).toBe(4);
    });

    it('rejects ready without a revision id', () => {
        expect(() =>
            decodeUploadReceipt(
                {
                    state: 'ready',
                    documentId: 'doc-1',
                    operationId: null,
                    revisionId: null,
                    file_name: 'market.pdf',
                    status: 'ready',
                    chunk_count: 4,
                    message: 'ready',
                },
                '/documents/upload',
            ),
        ).toThrow(/published revision/);
    });
});

describe('ingestion progress decoding', () => {
    it('keeps document, revision, and operation identity separate', () => {
        const progress = decodeIngestionProgress(
            {
                operationId: 'op-1',
                documentId: 'doc-1',
                revisionId: 'rev-1',
                state: 'failed',
                revisionState: 'failed',
                documentStatus: 'failed',
                fileName: 'market.pdf',
                fileType: 'pdf',
                chunkCount: 0,
                errorMessage: 'parser exploded',
            },
            '/documents/operations/op-1',
        );

        expect(progress).toMatchObject({
            operationId: 'op-1',
            documentId: 'doc-1',
            revisionId: 'rev-1',
            state: 'failed',
            errorMessage: 'parser exploded',
        });
    });
});
