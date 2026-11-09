// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    setPreference: vi.fn(),
}));

vi.mock('@/components/appearance', () => ({
    useAppearanceOptional: () => ({
        preference: 'system',
        resolved: 'light',
        reducedMotion: false,
        setPreference: mocks.setPreference,
    }),
}));

import { AppearanceSection } from './AppearanceSection';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('settings appearance section', () => {
    it('offers only System, Light, and Dark and selects them', () => {
        render(<AppearanceSection />);

        expect(screen.getAllByRole('radio')).toHaveLength(3);
        expect(screen.getByRole('radio', { name: /system/i }).getAttribute('aria-checked')).toBe(
            'true'
        );
        expect(screen.getByText(/Currently light/)).toBeTruthy();

        fireEvent.click(screen.getByRole('radio', { name: /dark/i }));
        expect(mocks.setPreference).toHaveBeenCalledWith('dark');
    });

    it('moves selection with arrow, Home, and End keys', () => {
        render(<AppearanceSection />);
        const system = screen.getByRole('radio', { name: /system/i });

        fireEvent.keyDown(system, { key: 'ArrowRight' });
        expect(mocks.setPreference).toHaveBeenLastCalledWith('light');

        fireEvent.keyDown(system, { key: 'ArrowLeft' });
        expect(mocks.setPreference).toHaveBeenLastCalledWith('dark');

        fireEvent.keyDown(system, { key: 'End' });
        expect(mocks.setPreference).toHaveBeenLastCalledWith('dark');

        fireEvent.keyDown(system, { key: 'Home' });
        expect(mocks.setPreference).toHaveBeenLastCalledWith('system');
    });
});
