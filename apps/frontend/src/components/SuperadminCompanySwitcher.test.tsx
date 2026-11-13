import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { SuperadminCompanySwitcher } from './SuperadminCompanySwitcher';
import type { Organization, User } from '@/services/types';

const companies = [
  { id: 'org-badge', name: 'Badge Test (internal)', slug: 'badge-test' },
  { id: 'org-lit', name: 'LIT Scholarship', slug: 'lit' },
] as Organization[];

const render = (props: React.ComponentProps<typeof SuperadminCompanySwitcher>) => {
  const client = new QueryClient();
  client.setQueryData(['superadmin-companies'], companies);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SuperadminCompanySwitcher {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

// The superadmin's own account belongs to the first organization
vi.mock('@/hooks/useAuthStore', () => ({
  useAuthStore: () => ({
    user: {
      id: 'u1', email: 'admin@example.com', role: 'superadmin',
      organization_id: 'org-badge', organization: { id: 'org-badge', name: 'Badge Test (internal)', slug: 'badge-test' },
    } as unknown as User,
  }),
}));

describe('SuperadminCompanySwitcher', () => {
  it('names the organization being viewed, not the superadmin’s own', () => {
    const html = render({ activeOrgId: 'org-lit' });
    expect(html).toContain('LIT Scholarship');
    expect(html).not.toContain('Badge Test');
  });

  it('prefers the viewed organization over a fallback name', () => {
    const html = render({ activeOrgId: 'org-lit', activeOrgName: 'Badge Test (internal)' });
    expect(html).toContain('LIT Scholarship');
  });

  it('falls back to the superadmin’s own organization when none is given', () => {
    expect(render({})).toContain('Badge Test (internal)');
  });
});
