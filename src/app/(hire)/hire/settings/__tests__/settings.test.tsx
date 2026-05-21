import { describe, it, expect, vi } from 'vitest';

const { redirect } = vi.hoisted(() => {
  const redirect = vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url};200;` });
  });
  return { redirect };
});

vi.mock('next/navigation', () => ({ redirect }));

describe('hire /settings redirect', () => {
  it('redirects to /settings/account', async () => {
    const mod = await import('../page');
    try {
      await mod.default();
    } catch (e: any) {
      expect(e.message).toBe('NEXT_REDIRECT');
      expect(e.digest).toContain('/settings/account');
    }
  });

  it('does not redirect to /hire/settings/account', async () => {
    const mod = await import('../page');
    try {
      await mod.default();
    } catch (e: any) {
      expect(e.digest).not.toContain('/hire/settings/account');
    }
  });
});
