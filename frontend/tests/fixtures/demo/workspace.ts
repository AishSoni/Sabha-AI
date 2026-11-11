import { DEMO_MEETING_ID, DEMO_PARTICIPANT_IDS } from "./journey";

const AS_OF = "2020-07-31";

function revision(revisionId: string, prompt: string, reason: string) {
    return {
        revision_id: revisionId,
        prompt,
        reason,
        created_at: AS_OF,
    };
}

export function demoWorkspaceSeedWire() {
    return {
        seed_version: 3,
        base_instructions:
            "You are a participant in a multi-agent advisory board. Stay in character and ground every claim in the meeting record.",
        highlighted_persona_id: "persona-credit",
        disclosure: {
            practice:
                "Workspace changes live in this browser tab only and disappear when the workspace is reset or the page is refreshed.",
            recording:
                "Participant replies, retrieval, and evidence come from the demo; browser edits never change recorded content.",
        },
        stacks: [
            {
                stack_id: "shared-fact-sheet",
                label: "Issuer fact sheet",
                scope: "shared",
                description: "Shared reference material for the demo board.",
            },
            {
                stack_id: "credit-evidence",
                label: "Credit evidence",
                scope: "private",
                description: "Private credit-analysis working papers.",
            },
            {
                stack_id: "downside-worksheet",
                label: "Downside worksheet",
                scope: "private",
                description: "Demo-authored downside review worksheet.",
            },
            {
                stack_id: "portfolio-mandate",
                label: "Portfolio mandate",
                scope: "private",
                description: "Fictional mandate constraints for the portfolio role.",
            },
        ],
        personas: [
            {
                persona_id: "persona-credit",
                name: "Mira",
                role: "Credit Analyst",
                description: "Tests issuer coverage and evidence quality.",
                color: "#2563eb",
                stack_ids: ["shared-fact-sheet", "credit-evidence"],
                active_revision_id: "rev-credit-3",
                recorded_participant_id: DEMO_PARTICIPANT_IDS.credit,
                revisions: [
                    revision(
                        "rev-credit-1",
                        "You are Mira.",
                        "Initial authored role."
                    ),
                    revision(
                        "rev-credit-2",
                        "You are Mira. State covenant headroom.",
                        "Adds covenant-headroom discipline."
                    ),
                    revision(
                        "rev-credit-3",
                        "You are Mira. State covenant headroom and flag unsupported assumptions.",
                        "Tightens the evidence standard."
                    ),
                ],
            },
            {
                persona_id: "persona-downside",
                name: "Arjun",
                role: "Risk Reviewer",
                description: "Presents the strongest failure case.",
                color: "#b45309",
                stack_ids: ["downside-worksheet"],
                active_revision_id: "rev-downside-1",
                recorded_participant_id: DEMO_PARTICIPANT_IDS.downside,
                revisions: [
                    revision(
                        "rev-downside-1",
                        "You are Arjun.",
                        "Initial authored role."
                    ),
                ],
            },
            {
                persona_id: "persona-portfolio",
                name: "Leena",
                role: "Portfolio Analyst",
                description: "Checks the fictional mandate fit.",
                color: "#047857",
                stack_ids: ["portfolio-mandate"],
                active_revision_id: "rev-portfolio-1",
                recorded_participant_id: DEMO_PARTICIPANT_IDS.portfolio,
                revisions: [
                    revision(
                        "rev-portfolio-1",
                        "You are Leena.",
                        "Initial authored role."
                    ),
                ],
            },
        ],
        samples: [
            {
                sample_id: "sample-shared-fact-sheet",
                asset_id: "shared-fact-sheet",
                file_name: "hdfc-v007-shared-fact-sheet.md",
                media_type: "text/markdown",
                size_bytes: 1350,
                sha256: "b".repeat(64),
                role: "shared-research",
                destination_kinds: ["meeting", "stack"],
                description:
                    "Historical terms, rating, and stated limits for the HDFC debenture. Shared reference material.",
                accessible_label: "Shared HDFC fact sheet, Markdown, four chunks",
                provenance: "demo-authored",
                rights_status: "approved-for-upload",
                approved_at: "2026-10-31",
                preview_mode: "inline",
                preview_note: null,
                scenario_id: "ready-after-indexing",
                prepared_chunk_count: 4,
                failure_message: null,
            },
            {
                sample_id: "sample-credit-notes",
                asset_id: "credit-evidence",
                file_name: "credit-evidence.md",
                media_type: "text/markdown",
                size_bytes: 534,
                sha256: "c".repeat(64),
                role: "participant-notes",
                destination_kinds: ["stack"],
                description:
                    "Private credit working notes. Only Mira is assigned to this knowledge stack.",
                accessible_label: "Credit analyst notes, Markdown, two chunks",
                provenance: "demo-authored",
                rights_status: "approved-for-upload",
                approved_at: "2026-10-31",
                preview_mode: "inline",
                preview_note: null,
                scenario_id: "ready-after-indexing",
                prepared_chunk_count: 2,
                failure_message: null,
            },
            {
                sample_id: "sample-portfolio-mandate",
                asset_id: "portfolio-mandate",
                file_name: "portfolio-mandate.md",
                media_type: "text/markdown",
                size_bytes: 669,
                sha256: "d".repeat(64),
                role: "mandate-material",
                destination_kinds: ["stack"],
                description:
                    "Fictional portfolio mandate for Leena's knowledge stack, with explicit record limits.",
                accessible_label: "Portfolio mandate, Markdown, three chunks",
                provenance: "demo-authored",
                rights_status: "approved-for-upload",
                approved_at: "2026-10-31",
                preview_mode: "inline",
                preview_note: null,
                scenario_id: "ready-after-indexing",
                prepared_chunk_count: 3,
                failure_message: null,
            },
            {
                sample_id: "sample-downside-retry",
                asset_id: "downside-worksheet",
                file_name: "downside-worksheet.md",
                media_type: "text/markdown",
                size_bytes: 603,
                sha256: "e".repeat(64),
                role: "failure-retry",
                destination_kinds: ["meeting", "stack"],
                description:
                    "Demo-authored downside worksheet. This sample fails once on purpose so the retry path can be practised safely.",
                accessible_label:
                    "Downside worksheet failure and retry sample, Markdown",
                provenance: "demo-authored",
                rights_status: "approved-for-upload",
                approved_at: "2026-10-31",
                preview_mode: "inline",
                preview_note: null,
                scenario_id: "fail-once",
                prepared_chunk_count: 3,
                failure_message:
                    "Simulation: the first ingestion attempt stopped before indexing. Retry reuses this same document and operation.",
            },
        ],
        documents: [
            {
                document_id: "practice-document-shared-fact",
                sample_id: "sample-shared-fact-sheet",
                scope_kind: "stack",
                scope_id: "shared-fact-sheet",
                status: "ready",
                operation_id: "practice-operation-shared-fact",
                revision_id: "practice-revision-shared-fact",
                chunk_count: 4,
                created_at: AS_OF,
            },
            {
                document_id: "practice-document-credit-notes",
                sample_id: "sample-credit-notes",
                scope_kind: "stack",
                scope_id: "credit-evidence",
                status: "ready",
                operation_id: "practice-operation-credit-notes",
                revision_id: "practice-revision-credit-notes",
                chunk_count: 2,
                created_at: AS_OF,
            },
            {
                document_id: "practice-document-downside-sheet",
                sample_id: "sample-downside-retry",
                scope_kind: "stack",
                scope_id: "downside-worksheet",
                status: "ready",
                operation_id: "practice-operation-downside-sheet",
                revision_id: "practice-revision-downside-sheet",
                chunk_count: 3,
                created_at: AS_OF,
            },
            {
                document_id: "practice-document-portfolio-mandate",
                sample_id: "sample-portfolio-mandate",
                scope_kind: "stack",
                scope_id: "portfolio-mandate",
                status: "ready",
                operation_id: "practice-operation-portfolio-mandate",
                revision_id: "practice-revision-portfolio-mandate",
                chunk_count: 3,
                created_at: AS_OF,
            },
        ],
    };
}

export function demoWorkspaceSeedEnvelope() {
    return {
        package_id: "hdfc-ine001a07rw5",
        version: "2",
        content_sha256: "a".repeat(64),
        seed_version: 3,
        seed: demoWorkspaceSeedWire(),
    };
}

export const DEMO_PINNED_IDENTITY = {
    packageId: "hdfc-ine001a07rw5",
    version: "2",
    contentSha256: "a".repeat(64),
    meetingId: DEMO_MEETING_ID,
};
