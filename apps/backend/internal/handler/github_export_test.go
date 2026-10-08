package handler

// SetGitHubSyncRunner replaces how background syncs are launched (tests run them synchronously).
func SetGitHubSyncRunner(h *GitHubHandler, run func(func())) {
	h.runAsync = run
}
