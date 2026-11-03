"use client";

/**
 * Demo tutorial state (spec-29).
 *
 * Three layers live here: the journey tracker (derived from recorded evidence),
 * the prompt selector and the presentation flags. Nothing in this provider
 * mutates the meeting, the recording or a practice workspace.
 */
import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useDemoWorkspace } from "@/features/demo-workspace";
import { useMeetingsRuntime } from "@/features/meetings/runtime/context";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";
import { combineSignals } from "@/shared/runtime/scope";
import { isRoomPath, deriveJourney, type TutorialJourney } from "./journey";
import { refineOnRoute, selectPrompt } from "./objectives";
import type { TutorialPrompt } from "./contract";

export interface DemoTutorialValue {
    prompt: TutorialPrompt | null;
    journey: TutorialJourney;
    hidden: boolean;
    chapterId: string | null;
    canResume: boolean;
    resume(): Promise<void>;
    restart(): void;
    hide(): void;
    show(): void;
}

const DemoTutorialContext = createContext<DemoTutorialValue | null>(null);

export function useDemoTutorial(): DemoTutorialValue {
    const value = useContext(DemoTutorialContext);
    if (!value) {
        throw new Error("The demo tutorial is not mounted.");
    }
    return value;
}

export function DemoTutorialProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname() ?? "/demo";
    const searchParams = useSearchParams();
    const router = useRouter();
    const run = useReplayRun();
    const runtime = useMeetingsRuntime();
    const workspace = useDemoWorkspace();
    const [hidden, setHidden] = useState(false);

    const chapterId = searchParams.get("chapter");
    const tab = searchParams.get("tab");

    const baseInput = {
        pathname,
        tab,
        session: run.session,
        checkpoint: run.checkpoint,
        playedTurnIds: run.runtime.replay?.playedTurnIds ?? new Set<string>(),
        canClose: run.runtime.replay?.canClose ?? false,
        closingCompleted: run.closingCompleted,
        settledIntents: run.settledIntents,
        meetingStatus: null,
    } as const;
    const base = deriveJourney({ ...baseInput, roomVisited: false });
    /**
     * Ended/archived status comes from the same recorded list read the
     * meetings page shows. It only fires once the recording reached its
     * closing terminal.
     */
    const listQuery = useQuery({
        queryKey: runtime.keys.meetingList(),
        queryFn: ({ signal }) =>
            runtime.reads.listMeetings(
                combineSignals(runtime.signal, signal)
            ),
        enabled: base.closingCompleted,
    });
    const meetingStatus =
        listQuery.data?.find((row) => row.id === run.session.meeting_id)
            ?.status ?? null;
    const journey = deriveJourney({
        ...baseInput,
        meetingStatus,
        roomVisited:
            isRoomPath(pathname) ||
            (baseInput.playedTurnIds.size ?? 0) > 0 ||
            run.closingCompleted,
    });
    const prompt = refineOnRoute(selectPrompt(journey), pathname);

    const hide = useCallback(() => setHidden(true), []);
    const show = useCallback(() => setHidden(false), []);

    const restart = useCallback(() => {
        setHidden(false);
        workspace.restartRecording();
        router.push("/demo");
    }, [router, workspace]);

    const resume = useCallback(async () => {
        const target = resumeDestination(run, journey);
        if (target.checkpoint && target.checkpoint !== run.checkpoint) {
            await run.switchCheckpoint(target.checkpoint, { force: true });
        }
        router.push(target.href);
    }, [journey, router, run]);

    const value = useMemo<DemoTutorialValue>(
        () => ({
            prompt,
            journey,
            hidden,
            chapterId,
            canResume: chapterId !== null,
            resume,
            restart,
            hide,
            show,
        }),
        [prompt, journey, hidden, chapterId, resume, restart, hide, show]
    );

    return (
        <DemoTutorialContext.Provider value={value}>
            {children}
        </DemoTutorialContext.Provider>
    );
}

interface ResumeDestination {
    href: string;
    checkpoint: string | null;
}

/**
 * Resume restores the composed meeting, never a guessed later checkpoint.
 * Chapter inspection is explicit; the deck lives in browser memory.
 */
function resumeDestination(
    run: ReturnType<typeof useReplayRun>,
    journey: TutorialJourney
): ResumeDestination {
    const meetingHref = `/demo/meetings/${run.session.meeting_id}?tab=chat`;
    if (journey.deck) {
        const checkpoint = journey.closingCompleted
            ? run.session.prepared_closing?.completed_checkpoint ??
              run.session.prepared_base_checkpoint
            : run.session.prepared_base_checkpoint;
        return { href: meetingHref, checkpoint };
    }
    const beats = [...run.session.beats].sort(
        (left, right) =>
            (left.ordinal ?? Number.MAX_SAFE_INTEGER) -
            (right.ordinal ?? Number.MAX_SAFE_INTEGER)
    );
    const current =
        beats.find((beat) => beat.route === "meeting") ?? beats[0] ?? null;
    if (!current) {
        return {
            href: meetingHref,
            checkpoint: run.session.initial_checkpoint,
        };
    }
    const checkpoint =
        current.checkpoint ?? current.completed_checkpoint ?? null;
    const suffix = current.tab ? `?tab=${current.tab}` : "";
    return {
        href: `/demo/meetings/${run.session.meeting_id}${suffix}`,
        checkpoint,
    };
}
