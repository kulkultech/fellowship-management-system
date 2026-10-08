import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Github,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { githubService } from '@/services/githubService';
import type { GitHubContributionCounts, GitHubFellowActivity, ProgramGitHubRepo } from '@/services/types';

interface ProgramGitHubActivityViewProps {
  programId: string;
}

type MetricKey = keyof GitHubContributionCounts;
type SortKey = MetricKey | 'total' | 'name';

const METRICS: { key: MetricKey; label: string; hint: string }[] = [
  { key: 'commits', label: 'Commits', hint: 'Commits on the default branch linked to their GitHub account' },
  { key: 'pull_requests', label: 'PRs Opened', hint: 'Pull requests they opened' },
  { key: 'pull_requests_merged', label: 'PRs Merged', hint: 'Pull requests they opened that were merged' },
  { key: 'issues', label: 'Issues', hint: 'Issues they opened' },
  { key: 'pr_comments', label: 'PR Comments', hint: 'Conversation comments on pull requests' },
  { key: 'review_comments', label: 'Review Comments', hint: 'Inline code review comments on pull requests' },
  { key: 'issue_comments', label: 'Issue Comments', hint: 'Comments on issues' },
];

const EMPTY_COUNTS: GitHubContributionCounts = {
  commits: 0,
  pull_requests: 0,
  pull_requests_merged: 0,
  issues: 0,
  pr_comments: 0,
  review_comments: 0,
  issue_comments: 0,
};

const totalOf = (c: GitHubContributionCounts) =>
  c.commits + c.pull_requests + c.issues + c.pr_comments + c.review_comments + c.issue_comments;

function formatRelative(iso?: string | null): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString();
}

const errorMessage = (err: any, fallback: string) => err?.response?.data?.error || err?.message || fallback;

export const ProgramGitHubActivityView: React.FC<ProgramGitHubActivityViewProps> = ({ programId }) => {
  const queryClient = useQueryClient();
  const queryKey = ['program-github-activity', programId];
  const [repoInput, setRepoInput] = useState('');
  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'total', dir: 'desc' });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => githubService.getActivity(programId),
    enabled: !!programId,
    // Poll while any repository is syncing in the background
    refetchInterval: (query) =>
      query.state.data?.repos.some((r) => r.sync_status === 'syncing') ? 3000 : false,
  });

  const repos = data?.repos ?? [];
  const fellows = data?.fellows ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addRepoMutation = useMutation({
    mutationFn: (url: string) => githubService.addRepo(programId, url),
    onSuccess: (repo) => {
      toast.success(`Tracking ${repo.full_name}. Fetching activity…`);
      setRepoInput('');
      invalidate();
    },
    onError: (err: any) => toast.error(errorMessage(err, 'Failed to add repository')),
  });

  const syncMutation = useMutation({
    mutationFn: (repoId: string) => githubService.syncRepo(programId, repoId),
    onSuccess: () => invalidate(),
    onError: (err: any) => toast.error(errorMessage(err, 'Failed to start sync')),
  });

  const removeMutation = useMutation({
    mutationFn: (repoId: string) => githubService.removeRepo(programId, repoId),
    onSuccess: () => {
      toast.success('Repository removed');
      if (repoFilter !== 'all') setRepoFilter('all');
      invalidate();
    },
    onError: (err: any) => toast.error(errorMessage(err, 'Failed to remove repository')),
  });

  const handleAddRepo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoInput.trim()) return;
    addRepoMutation.mutate(repoInput.trim());
  };

  const handleRemove = (repo: ProgramGitHubRepo) => {
    if (window.confirm(`Stop tracking ${repo.full_name}? Its activity will be removed from this table.`)) {
      removeMutation.mutate(repo.id);
    }
  };

  const countsFor = (f: GitHubFellowActivity): GitHubContributionCounts =>
    repoFilter === 'all' ? f.totals : f.by_repo[repoFilter] ?? EMPTY_COUNTS;

  const rows = useMemo(() => {
    const list = fellows.map((f) => ({ fellow: f, counts: countsFor(f) }));
    const dir = sort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      // Fellows without a GitHub profile always go last
      const aLinked = a.fellow.github_login ? 1 : 0;
      const bLinked = b.fellow.github_login ? 1 : 0;
      if (aLinked !== bLinked) return bLinked - aLinked;
      if (sort.key === 'name') return dir * a.fellow.full_name.localeCompare(b.fellow.full_name);
      const av = sort.key === 'total' ? totalOf(a.counts) : a.counts[sort.key];
      const bv = sort.key === 'total' ? totalOf(b.counts) : b.counts[sort.key];
      return av === bv ? a.fellow.full_name.localeCompare(b.fellow.full_name) : dir * (av - bv);
    });
    return list;
  }, [fellows, repoFilter, sort]);

  const linkedCount = fellows.filter((f) => f.github_login).length;

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }
    );

  const renderSortHeader = (sortKey: SortKey, label: string, hint?: string, align: 'left' | 'center' = 'center') => (
    <th key={sortKey} className={`px-3 py-3 ${align === 'center' ? 'text-center' : 'text-left'}`} title={hint}>
      <button
        type="button"
        onClick={() => toggleSort(sortKey)}
        className={`inline-flex items-center gap-1 font-extrabold hover:text-slate-900 transition ${
          sort.key === sortKey ? 'text-slate-900' : ''
        }`}
      >
        <span>{label}</span>
        {sort.key === sortKey &&
          (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  if (isLoading) {
    return (
      <div className="bg-white rounded-3xl p-12 border border-slate-200 shadow-sm flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading GitHub activity…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-3xl p-12 border border-slate-200 shadow-sm text-center space-y-3">
        <p className="text-xs text-slate-500">Could not load GitHub activity for this program.</p>
        <button type="button" onClick={() => refetch()} className="btn btn-sm btn-outline">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tracked Repositories */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-5">
        <div className="pb-4 border-b border-slate-100 space-y-1">
          <h3 className="text-lg font-extrabold text-slate-900">Tracked Repositories</h3>
          <p className="text-xs text-slate-500">
            Add the repositories fellows work on. Contributions are matched to fellows by the GitHub profile on their
            application.
          </p>
        </div>

        <form onSubmit={handleAddRepo} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="https://github.com/owner/repo or owner/repo"
            disabled={addRepoMutation.isPending}
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple transition text-slate-900 bg-white disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={addRepoMutation.isPending || !repoInput.trim()}
            className="btn btn-md btn-primary shrink-0 disabled:opacity-60"
          >
            {addRepoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>{addRepoMutation.isPending ? 'Adding…' : 'Add Repository'}</span>
          </button>
        </form>

        {!data?.github_token_configured && (
          <p className="text-2xs text-slate-400">
            The server has no GitHub token, so only public repositories can be tracked and GitHub allows 60 requests per
            hour. Set GITHUB_TOKEN on the backend to raise the limit and track private repositories.
          </p>
        )}

        {repos.length === 0 ? (
          <div className="py-8 text-center space-y-1">
            <Github className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-500">No repositories tracked yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl">
            {repos.map((repo) => (
              <li key={repo.id} className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <a
                    href={repo.html_url || `https://github.com/${repo.full_name}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900 hover:text-kulkul-purple transition"
                  >
                    <Github className="w-4 h-4 shrink-0" />
                    <span className="truncate">{repo.full_name}</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>
                  <RepoSyncStatus repo={repo} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => syncMutation.mutate(repo.id)}
                    disabled={repo.sync_status === 'syncing' || syncMutation.isPending}
                    className="btn btn-sm btn-outline disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${repo.sync_status === 'syncing' ? 'animate-spin' : ''}`} />
                    <span>{repo.sync_status === 'syncing' ? 'Syncing…' : 'Sync Now'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(repo)}
                    disabled={removeMutation.isPending}
                    className="btn btn-sm btn-ghost text-rose-600 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                    aria-label={`Stop tracking ${repo.full_name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Fellow Contributions */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <h3 className="text-lg font-extrabold text-slate-900">Fellow Contributions</h3>
            <p className="text-xs text-slate-500">
              {fellows.length === 0
                ? 'No fellows admitted to this program yet.'
                : `${linkedCount} of ${fellows.length} fellows have a GitHub profile on their application.`}
            </p>
          </div>
          {repos.length > 1 && (
            <select
              aria-label="Filter contributions by repository"
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
              className="px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
            >
              <option value="all">All repositories</option>
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          )}
        </div>

        {fellows.length === 0 ? null : repos.length === 0 ? (
          <p className="text-xs text-slate-500">Add a repository above to see each fellow's contributions.</p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs min-w-[880px]">
              <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                <tr>
                  {renderSortHeader('name', 'Fellow', undefined, 'left')}
                  {METRICS.map((m) => renderSortHeader(m.key, m.label, m.hint))}
                  {renderSortHeader('total', 'Total', 'Commits, PRs opened, issues, and all comments combined')}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ fellow, counts }) => (
                  <tr key={fellow.applicant_id} className="hover:bg-slate-50/60 transition">
                    <td className="px-3 py-3.5">
                      <div className="font-extrabold text-slate-900">{fellow.full_name}</div>
                      {fellow.github_login ? (
                        <a
                          href={`https://github.com/${fellow.github_login}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-2xs text-slate-500 hover:text-kulkul-purple hover:underline"
                        >
                          @{fellow.github_login}
                        </a>
                      ) : (
                        <div className="text-2xs text-slate-400">
                          {fellow.github_url ? 'GitHub link not recognized' : 'No GitHub on profile'}
                        </div>
                      )}
                    </td>
                    {METRICS.map((m) => (
                      <td
                        key={m.key}
                        className={`px-3 py-3.5 text-center font-bold ${
                          fellow.github_login && counts[m.key] > 0 ? 'text-slate-900' : 'text-slate-300'
                        }`}
                      >
                        {fellow.github_login ? counts[m.key] : '–'}
                      </td>
                    ))}
                    <td
                      className={`px-3 py-3.5 text-center font-black ${
                        fellow.github_login && totalOf(counts) > 0 ? 'text-kulkul-purple' : 'text-slate-300'
                      }`}
                    >
                      {fellow.github_login ? totalOf(counts) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const RepoSyncStatus: React.FC<{ repo: ProgramGitHubRepo }> = ({ repo }) => {
  if (repo.sync_status === 'syncing') {
    return (
      <div className="flex items-center gap-1 text-2xs text-slate-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Fetching activity from GitHub…</span>
      </div>
    );
  }
  if (repo.sync_status === 'error') {
    return (
      <div className="flex items-start gap-1 text-2xs text-rose-600">
        <AlertCircle className="w-3 h-3 mt-px shrink-0" />
        <span>
          Last sync failed: {repo.sync_error || 'unknown error'}
          {repo.last_synced_at ? ` · showing data from ${formatRelative(repo.last_synced_at)}` : ''}
        </span>
      </div>
    );
  }
  if (!repo.last_synced_at) {
    return <div className="text-2xs text-slate-400">Not synced yet</div>;
  }
  return (
    <div className="flex items-center gap-1 text-2xs text-slate-500">
      <Check className="w-3 h-3 text-emerald-600" />
      <span>
        Synced {formatRelative(repo.last_synced_at)}
        {repo.sync_truncated ? ' · very large repository, only the latest 3,000 items of each type were counted' : ''}
      </span>
    </div>
  );
};
