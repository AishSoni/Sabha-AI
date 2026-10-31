import { DEMO_MEETING_ID } from "./journey";

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
        seed_version: 1,
        disclosure: {
            practice:
                "Practice changes live in this browser tab only and disappear when the workspace is reset or the page is refreshed.",
            recording:
                "Participant replies and evidence come from the prepared recording; practice edits never change recorded content.",
        },
        stacks: [
            {
                stack_id: "shared-fact-sheet",
                label: "Issuer fact sheet",
                scope: "shared",
                description: "Shared reference material for the recorded board.",
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
                description: "Practice mandate constraints for the portfolio role.",
            },
        ],
        personas: [
            {
                persona_id: "persona-credit",
                name: "The Credit Analyst",
                role: "Credit Analyst",
                description: "Tests issuer coverage and evidence quality.",
                color: "#2563eb",
                stack_ids: ["shared-fact-sheet", "credit-evidence"],
                active_revision_id: "rev-credit-3",
                revisions: [
                    revision(
                        "rev-credit-1",
                        "You are the Credit Analyst.",
                        "Initial authored role."
                    ),
                    revision(
                        "rev-credit-2",
                        "You are the Credit Analyst. State covenant headroom.",
                        "Adds covenant-headroom discipline."
                    ),
                    revision(
                        "rev-credit-3",
                        "You are the Credit Analyst. State covenant headroom and flag unsupported assumptions.",
                        "Tightens the evidence standard."
                    ),
                ],
            },
            {
                persona_id: "persona-downside",
                name: "The Downside Reviewer",
                role: "Risk Reviewer",
                description: "Presents the strongest failure case.",
                color: "#b45309",
                stack_ids: ["downside-worksheet"],
                active_revision_id: "rev-downside-1",
                revisions: [
                    revision(
                        "rev-downside-1",
                        "You are the Downside Reviewer.",
                        "Initial authored role."
                    ),
                ],
            },
            {
                persona_id: "persona-portfolio",
                name: "The Portfolio Analyst",
                role: "Portfolio Analyst",
                description: "Checks the fictional mandate fit.",
                color: "#047857",
                stack_ids: ["portfolio-mandate"],
                active_revision_id: "rev-portfolio-1",
                revisions: [
                    revision(
                        "rev-portfolio-1",
                        "You are the Portfolio Analyst.",
                        "Initial authored role."
                    ),
                ],
            },
        ],
        practice_setups: [],
    };
}

export function demoWorkspaceSeedEnvelope() {
    return {
        package_id: "hdfc-ine001a07rw5",
        version: "2",
        content_sha256: "a".repeat(64),
        seed_version: 1,
        seed: demoWorkspaceSeedWire(),
    };
}

export const DEMO_PINNED_IDENTITY = {
    packageId: "hdfc-ine001a07rw5",
    version: "2",
    contentSha256: "a".repeat(64),
    meetingId: DEMO_MEETING_ID,
};
