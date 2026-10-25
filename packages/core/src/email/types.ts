export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Outbound email port. Dev logs to console; production will use AWS SES.
 * Never log KYC / secrets — verification and reset links are intentionally
 * included in the text body so local developers can click them.
 */
export interface EmailSender {
  send(input: SendEmailInput): Promise<void>;
}
