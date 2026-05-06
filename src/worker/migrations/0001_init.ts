import type { MigrationDefinition } from './types';

export const migration: MigrationDefinition = {
  name: 'init',
  statements: [
    `CREATE TABLE IF NOT EXISTS mails (
      id TEXT PRIMARY KEY,
      message_id TEXT,
      from_addr TEXT,
      from_name TEXT,
      to_addr TEXT NOT NULL,
      domain TEXT,
      received_by_addr TEXT,
      is_forwarded INTEGER DEFAULT 0,
      subject TEXT,
      body_preview TEXT,
      has_attachments INTEGER DEFAULT 0,
      attachment_count INTEGER DEFAULT 0,
      raw_size INTEGER,
      received_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mails_received_id ON mails(received_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_mails_from_received_id ON mails(from_addr, received_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_mails_to_received_id ON mails(to_addr, received_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_mails_domain_received_id ON mails(domain, received_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_mails_received_by_received_id ON mails(received_by_addr, received_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_mails_attachments_received_id ON mails(has_attachments, received_at DESC, id DESC)`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS mails_fts USING fts5(
      mail_id UNINDEXED,
      subject,
      addresses,
      tokenize = 'unicode61'
    )`,
    `CREATE TABLE IF NOT EXISTS mail_bodies (
      mail_id TEXT PRIMARY KEY,
      headers_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS mail_body_chunks (
      mail_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (mail_id, kind, chunk_index)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mail_body_chunks_mail_kind ON mail_body_chunks(mail_id, kind, chunk_index)`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS mail_content_fts USING fts5(
      mail_id UNINDEXED,
      chunk_index UNINDEXED,
      content,
      tokenize = 'unicode61'
    )`,
    `CREATE TABLE IF NOT EXISTS mail_attachments (
      id TEXT PRIMARY KEY,
      mail_id TEXT NOT NULL,
      filename TEXT,
      mime_type TEXT,
      size INTEGER,
      content_id TEXT,
      disposition TEXT,
      stored INTEGER DEFAULT 0,
      object_key TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mail_attachments_mail_id ON mail_attachments(mail_id)`,
    `CREATE INDEX IF NOT EXISTS idx_mail_attachments_object_key ON mail_attachments(object_key)`,
    `CREATE TABLE IF NOT EXISTS sent_mails (
      id TEXT PRIMARY KEY,
      resend_id TEXT,
      from_addr TEXT NOT NULL,
      from_name TEXT,
      to_addr TEXT NOT NULL,
      to_name TEXT,
      subject TEXT,
      body_preview TEXT,
      has_attachments INTEGER DEFAULT 0,
      attachment_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'sent',
      error TEXT,
      sent_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sent_mails_sent_id ON sent_mails(sent_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_sent_mails_from_sent_id ON sent_mails(from_addr, sent_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_sent_mails_to_sent_id ON sent_mails(to_addr, sent_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_sent_mails_resend_id ON sent_mails(resend_id)`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS sent_mails_fts USING fts5(
      sent_mail_id UNINDEXED,
      search_text,
      tokenize = 'unicode61'
    )`,
    `CREATE TABLE IF NOT EXISTS sent_mail_bodies (
      sent_mail_id TEXT PRIMARY KEY,
      text_body TEXT,
      html_body TEXT,
      headers_json TEXT,
      resend_response_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sent_mail_attachments (
      id TEXT PRIMARY KEY,
      sent_mail_id TEXT NOT NULL,
      filename TEXT,
      mime_type TEXT,
      size INTEGER,
      stored INTEGER DEFAULT 0,
      object_key TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sent_mail_attachments_mail_id ON sent_mail_attachments(sent_mail_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sent_mail_attachments_object_key ON sent_mail_attachments(object_key)`,
    `CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      zone_id TEXT NOT NULL,
      zone_name TEXT NOT NULL,
      name TEXT UNIQUE NOT NULL,
      parent_domain_id TEXT,
      is_subdomain INTEGER DEFAULT 0,
      setup_status TEXT DEFAULT 'ready',
      email_routing_enabled INTEGER DEFAULT 0,
      dns_configured INTEGER DEFAULT 0,
      catchall_enabled INTEGER DEFAULT 0,
      worker_action_enabled INTEGER DEFAULT 0,
      last_checked_at TEXT,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_domains_zone_id ON domains(zone_id)`,
    `CREATE INDEX IF NOT EXISTS idx_domains_root_name ON domains(is_subdomain, name)`,
    `CREATE INDEX IF NOT EXISTS idx_domains_parent_name ON domains(parent_domain_id, name)`,
    `CREATE TABLE IF NOT EXISTS system_logs (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      target TEXT,
      action TEXT,
      status TEXT,
      message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_system_logs_module_created ON system_logs(module, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_system_logs_status_created ON system_logs(status, created_at DESC)`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS system_logs_fts USING fts5(
      log_id UNINDEXED,
      search_text,
      tokenize = 'unicode61'
    )`,
    `CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at)`
  ]
};
