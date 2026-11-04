export const TOO_MANY_EMAILS_MESSAGE =
  "Слишком часто, попробуй через несколько минут";

// State of the sign-in form
export type LoginFormState = {
  status: "idle" | "error" | "sent";
  error?: string;
  // What the user typed, so the field keeps it after an error or a send
  value?: string;
  // The address the link was sent to, as the server stored it
  sentTo?: string;
};
