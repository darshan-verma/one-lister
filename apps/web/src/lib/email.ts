import { ConsoleEmailSender, type EmailSender } from "@one-lister/core";

let sender: EmailSender | undefined;

/** Shared EmailSender for the web app. Dev logs to console (incl. links). */
export function getEmailSender(): EmailSender {
  if (!sender) {
    // TODO: switch to AwsSesEmailSender in production once SES is wired.
    sender = new ConsoleEmailSender();
  }
  return sender;
}
