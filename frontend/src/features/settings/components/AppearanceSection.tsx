'use client';

/**
 * Appearance section (spec-38).
 *
 * This reuses the existing memory-only appearance owner: System/Light/Dark
 * only. Motion is governed by the operating-system preference and is not
 * re-exposed as a setting.
 */
import { useRef, type KeyboardEvent } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useAppearanceOptional, type AppearancePreference } from '@/components/appearance';

const OPTIONS = [
    {
        value: 'system',
        label: 'System',
        description: 'Follow your device preference.',
        icon: Monitor,
    },
    {
        value: 'light',
        label: 'Light',
        description: 'Use the light appearance.',
        icon: Sun,
    },
    {
        value: 'dark',
        label: 'Dark',
        description: 'Use the dark appearance.',
        icon: Moon,
    },
] as const satisfies ReadonlyArray<{
    value: AppearancePreference;
    label: string;
    description: string;
    icon: typeof Monitor;
}>;

export function AppearanceSection() {
    const appearance = useAppearanceOptional();
    const preference = appearance?.preference ?? 'system';
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const select = (value: AppearancePreference) => {
        appearance?.setPreference(value);
    };

    const handleKeyDown = (
        event: KeyboardEvent<HTMLButtonElement>,
        index: number,
    ) => {
        if (!appearance) {
            return;
        }
        let nextIndex: number | null = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            nextIndex = (index + 1) % OPTIONS.length;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            nextIndex = (index - 1 + OPTIONS.length) % OPTIONS.length;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = OPTIONS.length - 1;
        }
        if (nextIndex === null) {
            return;
        }
        event.preventDefault();
        const next = OPTIONS[nextIndex];
        select(next.value);
        optionRefs.current[nextIndex]?.focus();
    };

    return (
        <section aria-labelledby="settings-appearance-title" className="space-y-6">
            <div className="space-y-1">
                <h2 id="settings-appearance-title" className="type-section-title">
                    Appearance
                </h2>
                <p className="type-body text-ink-secondary">
                    Choose how Sabha looks in this browser tab. System follows your device
                    while this page is open.
                </p>
            </div>

            <div
                role="radiogroup"
                aria-labelledby="settings-appearance-title"
                className="grid gap-3 sm:grid-cols-3"
            >
                {OPTIONS.map(({ value, label, description, icon: Icon }, index) => {
                    const selected = preference === value;
                    return (
                        <button
                            key={value}
                            ref={(element) => {
                                optionRefs.current[index] = element;
                            }}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            tabIndex={selected ? 0 : -1}
                            disabled={!appearance}
                            onClick={() => select(value)}
                            onKeyDown={(event) => handleKeyDown(event, index)}
                            className={`m-control rounded-group border p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                                selected
                                    ? 'border-action bg-surface-selected text-ink'
                                    : 'border-separator text-ink-secondary hover:bg-surface-raised hover:text-ink'
                            }`}
                        >
                            <span className="flex items-center gap-2 type-control font-medium">
                                <Icon aria-hidden="true" className="size-4" />
                                {label}
                            </span>
                            <span className="mt-1 block type-meta text-ink-muted">
                                {description}
                                {value === 'system' && appearance
                                    ? ` Currently ${appearance.resolved}.`
                                    : ''}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
