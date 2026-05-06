export interface SendAttachmentInput {
  filename: string;
  mimeType?: string;
  content: string;
}

export interface SendMailInput {
  from: string;
  fromName?: string;
  to: string;
  toName?: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: SendAttachmentInput[];
}

export interface PreparedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  content: string;
  objectKey: string;
}

export interface ResendSuccess {
  id?: string;
  [key: string]: unknown;
}

export interface ResendFailure {
  name?: string;
  message?: string;
  statusCode?: number;
  [key: string]: unknown;
}

export interface InsertPendingSentMailInput {
  id: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  attachments: PreparedAttachment[];
  storedKeys: string[];
  sentAt: string;
}
