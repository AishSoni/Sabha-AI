"use client";

/**
 * Safe, read-only renderers for the evidence dialog (spec 21).
 *
 * Markdown disables raw HTML, remote images, and unsafe link schemes. CSV is
 * parsed into bounded text cells; JSON/text/derived Office text is preformatted
 * and capped. PDFs render only from a local blob URL in the native viewer.
 */

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
    EvidenceContent,
    EvidenceDescriptor,
    EvidenceTextContent,
} from "./contract";

const RENDER_TEXT_LIMIT = 400_000;
const CSV_MAX_ROWS = 200;
const CSV_MAX_COLUMNS = 20;
const CSV_MAX_CELL_CHARACTERS = 500;
const CSV_MAX_CHARACTERS = 200_000;

export interface CsvTable {
    rows: string[][];
    truncated: boolean;
}

export function parseCsvBounded(text: string): CsvTable | null {
    if (text.length === 0) {
        return { rows: [], truncated: false };
    }
    if (text.length > CSV_MAX_CHARACTERS) {
        return null;
    }

    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    let truncated = false;

    const pushCell = () => {
        row.push(cell.slice(0, CSV_MAX_CELL_CHARACTERS));
        if (cell.length > CSV_MAX_CELL_CHARACTERS) {
            truncated = true;
        }
        cell = "";
    };
    const pushRow = () => {
        pushCell();
        if (row.length > CSV_MAX_COLUMNS) {
            row = row.slice(0, CSV_MAX_COLUMNS);
            truncated = true;
        }
        rows.push(row);
        if (rows.length >= CSV_MAX_ROWS) {
            truncated = true;
        }
        row = [];
    };

    for (let index = 0; index < text.length; index += 1) {
        if (rows.length >= CSV_MAX_ROWS) {
            break;
        }
        const character = text[index];
        if (quoted) {
            if (character === '"') {
                if (text[index + 1] === '"') {
                    cell += '"';
                    index += 1;
                } else {
                    quoted = false;
                }
            } else {
                cell += character;
            }
            continue;
        }
        if (character === '"' && cell.length === 0) {
            quoted = true;
        } else if (character === ",") {
            pushCell();
        } else if (character === "\n") {
            pushRow();
        } else if (character === "\r") {
            if (text[index + 1] === "\n") {
                index += 1;
            }
            pushRow();
        } else {
            cell += character;
        }
    }
    if (rows.length < CSV_MAX_ROWS && (cell.length > 0 || row.length > 0)) {
        pushRow();
    }
    if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
        rows.pop();
    }
    return { rows, truncated };
}

function safeUrl(url: string): string {
    const trimmed = url.trim();
    if (/^(https?:|mailto:)/i.test(trimmed)) {
        return trimmed;
    }
    if (trimmed.startsWith("#")) {
        return trimmed;
    }
    return "";
}

function MarkdownBody({ text }: { text: string }) {
    return (
        <div className="space-y-3 text-sm leading-6 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                urlTransform={safeUrl}
                components={{
                    a: ({ children, href }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                        >
                            {children}
                        </a>
                    ),
                    img: ({ alt }) => (
                        <span className="text-muted-foreground">
                            {alt ? `[Image omitted: ${alt}]` : "[Image omitted]"}
                        </span>
                    ),
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}

function PreformattedBody({
    text,
    truncated,
    label,
}: {
    text: string;
    truncated: boolean;
    label?: string;
}) {
    const bounded = text.slice(0, RENDER_TEXT_LIMIT);
    const clipped = truncated || bounded.length < text.length;
    return (
        <div className="space-y-2">
            {label ? (
                <p className="text-xs text-muted-foreground">{label}</p>
            ) : null}
            <pre className="max-h-[55vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
                {bounded}
            </pre>
            {clipped ? (
                <p className="text-xs text-muted-foreground">
                    Preview truncated; the retained source may contain more.
                </p>
            ) : null}
        </div>
    );
}

function CsvBody({ content }: { content: EvidenceTextContent }) {
    const table = parseCsvBounded(content.text);
    if (!table) {
        return (
            <PreformattedBody
                text={content.text}
                truncated={content.truncated}
                label="CSV preview shown as plain text because the file exceeds the table limit."
            />
        );
    }
    const [header, ...body] = table.rows;
    return (
        <div className="space-y-2">
            <div className="max-h-[55vh] overflow-auto rounded-md border">
                <table className="w-full border-collapse text-left text-xs">
                    {header ? (
                        <thead className="bg-muted">
                            <tr>
                                {header.map((cell, index) => (
                                    <th
                                        key={`h-${index}`}
                                        scope="col"
                                        className="border px-2 py-1 font-medium"
                                    >
                                        {cell}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                    ) : null}
                    <tbody>
                        {body.map((cells, rowIndex) => (
                            <tr key={`r-${rowIndex}`}>
                                {cells.map((cell, cellIndex) => (
                                    <td
                                        key={`c-${rowIndex}-${cellIndex}`}
                                        className="border px-2 py-1 align-top"
                                    >
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {table.truncated || content.truncated ? (
                <p className="text-xs text-muted-foreground">
                    Table preview truncated to {CSV_MAX_ROWS} rows and{" "}
                    {CSV_MAX_COLUMNS} columns.
                </p>
            ) : null}
        </div>
    );
}

function derivedLabel(content: EvidenceTextContent): string | undefined {
    if (content.kind !== "derived") {
        return undefined;
    }
    if (content.derived_from === "xlsx") {
        return "Derived text from XLSX. Formatting, formulas, charts, macros, and embedded objects are not represented.";
    }
    if (content.derived_from === "docx") {
        return "Derived text from DOCX. Formatting, images, macros, and embedded objects are not represented.";
    }
    return "Derived text. The original formatting is not represented.";
}

export function EvidenceContentRenderer({
    descriptor,
    content,
}: {
    descriptor: EvidenceDescriptor;
    content: EvidenceContent;
}) {
    if (content.kind === "pdf") {
        return (
            <iframe
                src={content.url}
                title={`PDF preview: ${descriptor.title}`}
                referrerPolicy="no-referrer"
                className="h-[60vh] w-full rounded-md border bg-muted"
            />
        );
    }
    switch (content.kind) {
        case "markdown":
            return <MarkdownBody text={content.text} />;
        case "csv":
            return <CsvBody content={content} />;
        case "json":
            return (
                <PreformattedBody
                    text={content.text}
                    truncated={content.truncated}
                    label="JSON preview"
                />
            );
        case "derived":
            return (
                <PreformattedBody
                    text={content.text}
                    truncated={content.truncated}
                    label={derivedLabel(content)}
                />
            );
        default:
            return (
                <PreformattedBody
                    text={content.text}
                    truncated={content.truncated}
                />
            );
    }
}
