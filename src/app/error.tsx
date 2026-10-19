"use client";

import { ErrorMessage, type ErrorPageProps } from "@/components/error-message";

// A page failed to render; the header from the root layout stays on screen
export default function ErrorPage(props: ErrorPageProps) {
  return <ErrorMessage {...props} />;
}
