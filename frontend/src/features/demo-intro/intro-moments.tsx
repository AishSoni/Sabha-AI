"use client";

import { ParticipantMark } from "@/components/identity/participant-mark";
import {
    INTRO_CARD_NODES,
    type IntroCardData,
    type IntroCardKind,
    type IntroCardNode,
} from "./scene-config";
import { INTRO_STEPS } from "./steps";
import { introParticipant } from "./participants";

function ParticipantIdentity({ participantId }: { participantId?: string }) {
    const participant = introParticipant(participantId);
    if (!participant) return null;
    return (
        <ParticipantMark
            participant={{
                id: participant.markId,
                name: participant.name,
                color: participant.color,
            }}
            size="sm"
        />
    );
}

function CardBody({ data }: { data: IntroCardData }) {
    if (data.rows) {
        return (
            <dl className="intro-fact__rows">
                {data.rows.map((row) => (
                    <div key={row.label} className="intro-fact__row">
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                    </div>
                ))}
            </dl>
        );
    }
    if (data.body) {
        return <p className="intro-card__body">{data.body}</p>;
    }
    return null;
}

function CardContent({
    kind,
    data,
    compact = false,
}: {
    kind: IntroCardKind;
    data: IntroCardData;
    compact?: boolean;
}) {
    if (kind === "qualifier") {
        return <p className="intro-qualifier">{data.title}</p>;
    }

    if (kind === "participant" || kind === "speaker") {
        return (
            <div className="intro-person">
                <ParticipantIdentity participantId={data.participantId} />
                <div className="intro-person__text">
                    <p className="intro-person__name">{data.title}</p>
                    {data.body ? (
                        <p className="intro-card__body">{data.body}</p>
                    ) : null}
                </div>
            </div>
        );
    }

    if (kind === "fact") {
        return (
            <div className="intro-fact">
                <p className="intro-fact__title">{data.title}</p>
                <CardBody data={data} />
            </div>
        );
    }

    if (kind === "lens") {
        return (
            <div className="intro-lens">
                <div className="intro-lens__head">
                    <ParticipantIdentity participantId={data.participantId} />
                    {data.body ? (
                        <p className="intro-card__body">{data.body}</p>
                    ) : null}
                </div>
                <p className="intro-lens__question">{data.title}</p>
            </div>
        );
    }

    return (
        <div className={`intro-card__stack${compact ? " is-compact" : ""}`}>
            <p className="intro-card__title" data-tone={data.tone}>
                {data.title}
            </p>
            {data.body ? <p className="intro-card__body">{data.body}</p> : null}
        </div>
    );
}

/**
 * One visual card. The same content is used by the WebGL projection and the
 * reduced-motion/fallback reading view, so the two modes cannot drift.
 */
export function IntroCard({ node }: { node: IntroCardNode }) {
    return (
        <div
            className="intro-card"
            data-intro-node={node.id}
            data-intro-card={node.kind}
            data-intro-readable
            data-tone={node.data.tone}
        >
            <CardContent kind={node.kind} data={node.data} />
        </div>
    );
}

export function IntroMomentCopy({ moment }: { moment: number }) {
    const step = INTRO_STEPS[moment];
    if (!step) return null;
    const Heading = moment === 0 ? "h1" : "h2";
    return (
        <div
            className="intro-copy"
            data-intro-node={`copy-${moment}`}
            data-intro-readable
        >
            <Heading className="intro-copy__title" tabIndex={-1}>
                {step.title}
            </Heading>
            <p className="intro-copy__body">{step.body}</p>
        </div>
    );
}

export function IntroCardsForMoment({ moment }: { moment: number }) {
    return (
        <>
            {INTRO_CARD_NODES.filter((node) => node.moment === moment).map(
                (node) => (
                    <IntroCard key={node.id} node={node} />
                )
            )}
        </>
    );
}

export function IntroMoments() {
    return (
        <>
            {INTRO_STEPS.map((step, moment) => (
                <section
                    key={step.id}
                    className="intro-moment"
                    data-intro-moment={moment}
                    aria-labelledby={`intro-heading-${moment}`}
                >
                    <div
                        className="intro-copy"
                        data-intro-node={`copy-${moment}`}
                        data-intro-readable
                    >
                        {moment === 0 ? (
                            <h1
                                id={`intro-heading-${moment}`}
                                className="intro-copy__title"
                                tabIndex={-1}
                            >
                                {step.title}
                            </h1>
                        ) : (
                            <h2
                                id={`intro-heading-${moment}`}
                                className="intro-copy__title"
                            >
                                {step.title}
                            </h2>
                        )}
                        <p className="intro-copy__body">{step.body}</p>
                    </div>
                    <IntroCardsForMoment moment={moment} />
                </section>
            ))}
        </>
    );
}

export function IntroFallbackMoments() {
    return (
        <div className="intro-fallback__moments">
            {INTRO_STEPS.map((step, moment) => (
                <section
                    key={step.id}
                    className="intro-fallback__moment"
                    data-fallback-moment={moment}
                    aria-labelledby={`intro-fallback-heading-${moment}`}
                >
                    <div className="intro-fallback__copy">
                        {moment === 0 ? (
                            <h1
                                id={`intro-fallback-heading-${moment}`}
                                className="intro-copy__title"
                                tabIndex={-1}
                            >
                                {step.title}
                            </h1>
                        ) : (
                            <h2
                                id={`intro-fallback-heading-${moment}`}
                                className="intro-copy__title"
                            >
                                {step.title}
                            </h2>
                        )}
                        <p className="intro-copy__body">{step.body}</p>
                    </div>
                    <div className="intro-fallback__cards">
                        {INTRO_CARD_NODES.filter(
                            (node) => node.moment === moment
                        ).map((node) => (
                            <div
                                key={node.id}
                                className="intro-card"
                                data-intro-card={node.kind}
                                data-tone={node.data.tone}
                            >
                                <CardContent kind={node.kind} data={node.data} />
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
