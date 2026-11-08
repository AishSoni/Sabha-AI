/**
 * Canonical guided HDFC journey wire fixture (spec-18/spec-23).
 *
 * Mirrors the eight beats and safe-config payload published by
 * backend/scripts/build_guided_package.py. The demo characterization tests
 * pin this shape before the expanded workspace extracts shared presentation.
 */

export const DEMO_MEETING_ID = "11111111-1111-4111-8111-111111111111";

export const DEMO_PARTICIPANT_IDS = {
    credit: "22222222-2222-4222-8222-222222222222",
    downside: "33333333-3333-4333-8333-333333333333",
    portfolio: "44444444-4444-4444-8444-444444444444",
} as const;

export const DEMO_CHECKPOINTS = [
    "checkpoint-initial",
    "checkpoint-created",
    "checkpoint-credit",
    "checkpoint-downside",
    "checkpoint-followup",
    "checkpoint-portfolio",
    "checkpoint-consensus",
    "checkpoint-closed",
    "checkpoint-archived",
] as const;

export const DEMO_STACK_LABELS: Record<string, string> = {
    "shared-fact-sheet": "Shared fact sheet",
    "credit-evidence": "Credit evidence",
    "downside-worksheet": "Downside worksheet",
    "portfolio-mandate": "Portfolio mandate",
};

export const DEMO_BOARD_PARTICIPANTS = [
    {
        participant_id: DEMO_PARTICIPANT_IDS.credit,
        name: "The Credit Analyst",
        role: "credit",
        persona_summary:
            "Assess the issuer's credit quality and the evidence behind the coupon.",
        stack_ids: ["shared-fact-sheet", "credit-evidence"],
        color: "#38bdf8",
    },
    {
        participant_id: DEMO_PARTICIPANT_IDS.downside,
        name: "The Downside Reviewer",
        role: "risk",
        persona_summary:
            "Stress the case and name the assumptions that would break it.",
        stack_ids: ["shared-fact-sheet", "downside-worksheet"],
        color: "#f59e0b",
    },
    {
        participant_id: DEMO_PARTICIPANT_IDS.portfolio,
        name: "The Portfolio Analyst",
        role: "portfolio",
        persona_summary:
            "Test whether the mandate permits the position and how it fits the book.",
        stack_ids: ["shared-fact-sheet", "portfolio-mandate"],
        color: "#34d399",
    },
] as const;

export const DEMO_INTENTS = [
    {
        intent_id: "create-meeting",
        kind: "create_meeting",
        checkpoint: "checkpoint-created",
        label: "Start the meeting",
    },
    {
        intent_id: "credit-analyst",
        kind: "start_participant",
        checkpoint: "checkpoint-created",
        participant_id: DEMO_PARTICIPANT_IDS.credit,
        operation_id: "operation-credit",
        tape_id: "tape-credit",
        label: "Ask the Credit Analyst",
    },
    {
        intent_id: "downside-reviewer",
        kind: "start_participant",
        checkpoint: "checkpoint-credit",
        participant_id: DEMO_PARTICIPANT_IDS.downside,
        operation_id: "operation-downside",
        tape_id: "tape-downside",
        label: "Ask the Downside Reviewer",
    },
    {
        intent_id: "director-follow-up",
        kind: "director_follow_up",
        checkpoint: "checkpoint-followup",
        participant_id: DEMO_PARTICIPANT_IDS.portfolio,
        operation_id: "operation-follow-up",
        label: "Send the supported follow-up",
    },
    {
        intent_id: "portfolio-analyst",
        kind: "start_participant",
        checkpoint: "checkpoint-followup",
        participant_id: DEMO_PARTICIPANT_IDS.portfolio,
        operation_id: "operation-portfolio",
        tape_id: "tape-portfolio",
        label: "Ask the Portfolio Analyst",
    },
    {
        intent_id: "concluding-discussion",
        kind: "start_participant",
        checkpoint: "checkpoint-portfolio",
        participant_id: DEMO_PARTICIPANT_IDS.credit,
        operation_id: "operation-consensus",
        tape_id: "tape-consensus",
        label: "Ask for the concluding view",
    },
    {
        intent_id: "close-meeting",
        kind: "request_closing",
        checkpoint: "checkpoint-consensus",
        closing_tape_id: "tape-closing",
        label: "Close the meeting",
    },
    {
        intent_id: "archive-meeting",
        kind: "archive_meeting",
        checkpoint: "checkpoint-archived",
        label: "Archive the meeting",
    },
] as const;

export const DEMO_TAPES = [
    {
        tape_id: "tape-credit",
        operation_id: "operation-credit",
        participant_id: DEMO_PARTICIPANT_IDS.credit,
        initial_checkpoint: "checkpoint-created",
        completed_checkpoint: "checkpoint-credit",
    },
    {
        tape_id: "tape-downside",
        operation_id: "operation-downside",
        participant_id: DEMO_PARTICIPANT_IDS.downside,
        initial_checkpoint: "checkpoint-credit",
        completed_checkpoint: "checkpoint-downside",
    },
    {
        tape_id: "tape-portfolio",
        operation_id: "operation-portfolio",
        participant_id: DEMO_PARTICIPANT_IDS.portfolio,
        initial_checkpoint: "checkpoint-followup",
        completed_checkpoint: "checkpoint-portfolio",
    },
    {
        tape_id: "tape-consensus",
        operation_id: "operation-consensus",
        participant_id: DEMO_PARTICIPANT_IDS.credit,
        initial_checkpoint: "checkpoint-portfolio",
        completed_checkpoint: "checkpoint-consensus",
    },
] as const;

export const DEMO_BEATS = [
    {
        beat_id: "meet-the-board",
        title: "Meet the board",
        anchor: "demo-board",
        checkpoint: "checkpoint-initial",
        ordinal: 1,
        objective: "Inspect the prepared participants and their knowledge assignments.",
        route: "board",
        tab: "roster",
        start_checkpoint: "checkpoint-initial",
        completed_checkpoint: "checkpoint-initial",
        disclosure: "Prepared board for the recorded meeting.",
        steps: [
            {
                step_id: "inspect-board",
                label: "Review the prepared board",
                completion: "acknowledge",
                requires_tab: "roster",
            },
        ],
        claim_ids: [],
        input_asset_ids: [
            "shared-fact-sheet",
            "credit-evidence",
            "downside-worksheet",
            "portfolio-mandate",
        ],
    },
    {
        beat_id: "start-the-meeting",
        title: "Start the meeting",
        anchor: "demo-new",
        checkpoint: "checkpoint-initial",
        ordinal: 2,
        objective: "Complete the prepared creation form.",
        route: "new",
        start_checkpoint: "checkpoint-initial",
        completed_checkpoint: "checkpoint-created",
        disclosure: "No upload or write occurs; the intake receipt is recorded.",
        steps: [
            {
                step_id: "create-meeting",
                label: "Create meeting",
                intent_id: "create-meeting",
                completion: "checkpoint",
            },
        ],
        claim_ids: [],
        input_asset_ids: [],
    },
    {
        beat_id: "establish-facts",
        title: "Establish the facts",
        anchor: "demo-room",
        checkpoint: "checkpoint-created",
        ordinal: 3,
        objective: "Ask the Credit Analyst for the supported facts.",
        route: "meeting",
        tab: "chat",
        start_checkpoint: "checkpoint-created",
        completed_checkpoint: "checkpoint-credit",
        disclosure: "Prepared retrieval; no live search or model call.",
        steps: [
            {
                step_id: "ask-credit",
                label: "Ask the Credit Analyst",
                intent_id: "credit-analyst",
                completion: "turn_terminal",
                requires_tab: "chat",
            },
        ],
        claim_ids: [],
        input_asset_ids: ["shared-fact-sheet", "credit-evidence"],
    },
    {
        beat_id: "challenge-the-case",
        title: "Challenge the case",
        anchor: "demo-room",
        checkpoint: "checkpoint-credit",
        ordinal: 4,
        objective: "Ask the Downside Reviewer and inspect the disagreement.",
        route: "meeting",
        tab: "chat",
        start_checkpoint: "checkpoint-credit",
        completed_checkpoint: "checkpoint-downside",
        disclosure: "The downside worksheet is demo-authored, not issuer research.",
        steps: [
            {
                step_id: "ask-downside",
                label: "Ask the Downside Reviewer",
                intent_id: "downside-reviewer",
                completion: "turn_terminal",
                requires_tab: "chat",
            },
            {
                step_id: "review-disagreement",
                label: "Review the disagreement",
                completion: "acknowledge",
                requires_tab: "disagreements",
            },
        ],
        claim_ids: [],
        input_asset_ids: ["downside-worksheet"],
    },
    {
        beat_id: "address-uncertainty",
        title: "Address uncertainty",
        anchor: "demo-room",
        checkpoint: "checkpoint-downside",
        ordinal: 5,
        objective: "Send the supported follow-up and ask the Portfolio Analyst.",
        route: "meeting",
        tab: "chat",
        start_checkpoint: "checkpoint-downside",
        completed_checkpoint: "checkpoint-portfolio",
        disclosure: "The mandate excerpt is fictional and prepared for this replay.",
        steps: [
            {
                step_id: "send-follow-up",
                label: "Send the supported follow-up",
                intent_id: "director-follow-up",
                completion: "checkpoint",
            },
            {
                step_id: "ask-portfolio",
                label: "Ask the Portfolio Analyst",
                intent_id: "portfolio-analyst",
                completion: "turn_terminal",
                requires_tab: "chat",
            },
        ],
        claim_ids: [],
        input_asset_ids: ["portfolio-mandate"],
    },
    {
        beat_id: "align",
        title: "Align on the checklist",
        anchor: "demo-room",
        checkpoint: "checkpoint-portfolio",
        ordinal: 6,
        objective: "Ask for the concluding view and inspect the consensus.",
        route: "meeting",
        tab: "chat",
        start_checkpoint: "checkpoint-portfolio",
        completed_checkpoint: "checkpoint-consensus",
        steps: [
            {
                step_id: "ask-consensus",
                label: "Ask for the concluding view",
                intent_id: "concluding-discussion",
                completion: "turn_terminal",
                requires_tab: "chat",
            },
            {
                step_id: "review-consensus",
                label: "Review the consensus",
                completion: "acknowledge",
                requires_tab: "consensus",
            },
        ],
        claim_ids: [],
        input_asset_ids: [],
    },
    {
        beat_id: "close-the-meeting",
        title: "Close the meeting",
        anchor: "demo-room",
        checkpoint: "checkpoint-consensus",
        ordinal: 7,
        objective: "Request the recorded closing.",
        route: "meeting",
        tab: "closing",
        start_checkpoint: "checkpoint-consensus",
        completed_checkpoint: "checkpoint-closed",
        disclosure: "Recorded closing. No live vote or model call occurs.",
        steps: [
            {
                step_id: "close-meeting",
                label: "Close the meeting",
                intent_id: "close-meeting",
                completion: "closing_completed",
                requires_tab: "closing",
            },
        ],
        claim_ids: [],
        input_asset_ids: [],
    },
    {
        beat_id: "archive-the-meeting",
        title: "Archive the meeting",
        anchor: "demo-meetings",
        checkpoint: "checkpoint-closed",
        ordinal: 8,
        objective: "Archive the ended record.",
        route: "list",
        start_checkpoint: "checkpoint-closed",
        completed_checkpoint: "checkpoint-archived",
        disclosure: "The archive is a recorded overlay; the meeting stays ended.",
        steps: [
            {
                step_id: "archive-meeting",
                label: "Archive the meeting",
                intent_id: "archive-meeting",
                completion: "checkpoint",
            },
        ],
        claim_ids: [],
        input_asset_ids: [],
    },
] as const;

export function replaySessionWire() {
    return {
        run_id: "demo-run-1",
        package_version: "2",
        package_id: "hdfc-ine001a07rw5",
        content_sha256: "a".repeat(64),
        meeting_id: DEMO_MEETING_ID,
        label: "Guided replay",
        title: "HDFC Ltd 7.87% 2022 debenture",
        as_of: "31 July 2020",
        disclosure:
            "Prepared recording. Replies and evidence are recorded; no live model or search runs.",
        stack_labels: DEMO_STACK_LABELS,
        provenance: { source: "packaged" },
        capabilities: {
            meetingRead: true,
            turnObservation: true,
            disagreements: true,
            consensus: true,
            contextStats: false,
            createMeeting: false,
            sendMessage: false,
            submitTurn: false,
            cancelTurn: false,
            summary: false,
            documents: false,
            closing: false,
        },
        checkpoint_id: "checkpoint-initial",
        initial_checkpoint: "checkpoint-initial",
        checkpoints: [...DEMO_CHECKPOINTS],
        intents: DEMO_INTENTS.map((intent) => ({ ...intent })),
        beats: DEMO_BEATS.map((beat) => ({
            ...beat,
            steps: beat.steps.map((step) => ({ ...step })),
        })),
        tapes: DEMO_TAPES.map((tape) => ({ ...tape })),
        assets: [],
        claims: [],
        preview: { available: false, asset_ids: [] },
        retired: false,
    };
}

export function demoSafeConfigWire() {
    return {
        board: {
            title: "HDFC Ltd 7.87% 2022 debenture",
            participants: DEMO_BOARD_PARTICIPANTS.map((participant) => ({
                ...participant,
                stack_ids: [...participant.stack_ids],
            })),
            stacks: Object.fromEntries(
                Object.entries(DEMO_STACK_LABELS).map(([id, label]) => [
                    id,
                    {
                        label,
                        scope: id.startsWith("shared") ? "shared" : "private",
                    },
                ])
            ),
            preset: {
                agenda: "Decide whether the mandate permits the HDFC position.",
                context:
                    "Prepared board for the recorded HDFC debenture discussion.",
                participant_ids: Object.values(DEMO_PARTICIPANT_IDS),
                document_id: "document-fact-sheet",
                document_label: "Prepared fact sheet",
            },
        },
        intake: {
            stages: [
                { key: "received", label: "Received", at: "2026-10-16T09:00:00Z" },
                { key: "parsed", label: "Parsed", at: "2026-10-16T09:00:01Z" },
                { key: "chunked", label: "Chunked", at: "2026-10-16T09:00:02Z" },
                { key: "embedded", label: "Embedded", at: "2026-10-16T09:00:03Z" },
                { key: "ready", label: "Ready", at: "2026-10-16T09:00:04Z" },
            ],
            note: "Recorded intake stages for the prepared document.",
        },
    };
}

export function demoMeetingWire(name = "HDFC Ltd 7.87% 2022 debenture") {
    return {
        id: DEMO_MEETING_ID,
        user_id: null,
        name,
        agenda: "Decide whether the mandate permits the HDFC position.",
        status: "active",
        total_cost: 0,
        created_at: "2026-10-16T09:00:00.000000Z",
        participants: DEMO_BOARD_PARTICIPANTS.map((participant) => ({
            id: participant.participant_id,
            meeting_id: DEMO_MEETING_ID,
            name: participant.name,
            role: participant.role,
            system_prompt: participant.persona_summary,
            provider_config: {
                provider: "ollama",
                model: "llama3.2",
                temperature: 0.7,
                max_tokens: 2048,
            },
            color: participant.color,
            persona_id: null,
            stack_ids: [...participant.stack_ids],
            created_at: "2026-10-16T09:00:00.000000Z",
        })),
        messages: [],
    };
}
