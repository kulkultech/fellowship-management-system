package handler

import "time"

// SetGitHubSyncRunner replaces how background syncs are launched (tests run them synchronously).
func SetGitHubSyncRunner(h *GitHubHandler, run func(func())) {
	h.runAsync = run
}

// SetGitHubAutoSyncAfter changes how long repositories go unsynced before the scheduler refreshes them.
func SetGitHubAutoSyncAfter(h *GitHubHandler, d time.Duration) {
	h.autoSyncAfter = d
}
