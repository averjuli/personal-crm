// Emails of the e2e tests: the app sends them to Mailpit (SMTP_URL), the tests
// read them through its API. Mailpit is shared with development and is not
// cleared, so a test never counts emails from earlier runs: it opens a mailbox
// (remembers how many emails the address already has) before asking for a
// link and reads only what arrives after that

const mailpitUrl = process.env.MAILPIT_URL ?? "http://localhost:8025";

type MessageSummary = { ID: string };

export type Message = {
  ID: string;
  Subject: string;
  From: { Name: string; Address: string };
  To: { Name: string; Address: string }[];
  Text: string;
  HTML: string;
};

// An address nobody else has used, in lower case (the app stores it so)
export function uniqueEmail(label: string) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${label}-${suffix}@example.com`;
}

async function messagesTo(email: string) {
  const response = await fetch(
    `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
  );
  if (!response.ok) {
    throw new Error(`Mailpit answered ${response.status}`);
  }
  const body = (await response.json()) as { messages: MessageSummary[] };
  return body.messages;
}

export async function countMessagesTo(email: string) {
  return (await messagesTo(email)).length;
}

export async function openMailbox(email: string) {
  const baseline = await countMessagesTo(email);

  // How many emails arrived since the mailbox was opened
  async function received() {
    return (await countMessagesTo(email)) - baseline;
  }

  // The newest email, once `count` new ones have arrived
  async function message(count = 1): Promise<Message> {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const messages = await messagesTo(email);
      if (messages.length - baseline >= count) {
        const response = await fetch(
          `${mailpitUrl}/api/v1/message/${messages[0].ID}`,
        );
        return (await response.json()) as Message;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Expected ${count} new email(s) to ${email}, got ${messages.length - baseline}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // The sign-in link of the newest email, once `count` new ones have arrived
  async function link(count = 1) {
    const found = (await message(count)).Text.match(/https?:\/\/\S+/)?.[0];
    if (!found) {
      throw new Error(`No link in the email to ${email}`);
    }
    return found;
  }

  return { received, message, link };
}
