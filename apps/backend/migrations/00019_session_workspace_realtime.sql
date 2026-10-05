-- Migration 00019: Real-time Workspace State for Coding Pad & Excalidraw Whiteboard
ALTER TABLE program_sessions ADD COLUMN IF NOT EXISTS workspace_state JSONB NOT NULL DEFAULT '{}'::jsonb;
