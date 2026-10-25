import type { EmailSender, SendEmailInput } from "./types.js";

/** Dev/test EmailSender — prints the full message (including links) to stdout. */
export class ConsoleEmailSender implements EmailSender {
  async send(input: SendEmailInput): Promise<void> {
    console.log(
      [
        "----- email (console) -----",
        `to: ${input.to}`,
        `subject: ${input.subject}`,
        input.text,
        "----- end email -----",
      ].join("\n"),
    );
  }
}

// TODO: AwsSesEmailSender — send via AWS SES (ap-south-1) once infra is ready.
