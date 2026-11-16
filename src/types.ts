export type MailFolder = "inbox" | "starred" | "important" | "drafts" | "sent" | "archive" | "trash" | "spam";

export interface DemoMessage {
  id: string;
  sender: string;
  email: string;
  subject: string;
  preview: string;
  body: string[];
  time: string;
  color: string;
  initials: string;
  unread?: boolean;
  starred?: boolean;
  important?: boolean;
  attachment?: string;
  folder: MailFolder;
}
