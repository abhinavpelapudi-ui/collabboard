-- CollabBoard PostgreSQL Schema
-- Run this in Supabase SQL Editor

-- Users
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  password_hash   TEXT,
  avatar_url      TEXT,
  plan            TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'pro' | 'business' | 'enterprise'
  email_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- OAuth accounts (links Google/GitHub identities to users)
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,   -- 'google' | 'github'
  provider_id TEXT NOT NULL,
  UNIQUE (provider, provider_id)
);

-- OTP codes for email-based one-time-password login
CREATE TABLE IF NOT EXISTS otp_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);

-- Email confirmation tokens (sent after registration)
CREATE TABLE IF NOT EXISTS email_confirmations (
  token        TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ
);

-- License keys (admin-generated, redeemed by users to upgrade plan)
CREATE TABLE IF NOT EXISTS license_keys (
  key              TEXT PRIMARY KEY,
  plan             TEXT NOT NULL,              -- 'pro' | 'business' | 'enterprise'
  max_activations  INT  NOT NULL DEFAULT 1,
  activations      INT  NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Boards
CREATE TABLE IF NOT EXISTS boards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL DEFAULT 'Untitled Board',
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Board members (for shared access)
CREATE TABLE IF NOT EXISTS board_members (
  board_id   UUID REFERENCES boards(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'editor',  -- 'owner' | 'editor' | 'viewer'
  PRIMARY KEY (board_id, user_id)
);

-- Objects (sticky notes, shapes, frames, connectors)
CREATE TABLE IF NOT EXISTS objects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,    -- 'sticky' | 'rect' | 'circle' | 'frame' | 'connector' | 'text'
  props       JSONB NOT NULL DEFAULT '{}',
  z_index     INT NOT NULL DEFAULT 0,
  created_by  TEXT REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_boards_owner     ON boards(owner_id);
CREATE INDEX IF NOT EXISTS idx_objects_board    ON objects(board_id);
CREATE INDEX IF NOT EXISTS idx_objects_zindex   ON objects(board_id, z_index);
CREATE INDEX IF NOT EXISTS idx_members_user     ON board_members(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_user       ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_email        ON otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_confirm_user     ON email_confirmations(user_id);
