"use client";

import "@fontsource-variable/manrope";
import "@fontsource-variable/unbounded";
import "./globals.css";

import { AppDocument } from "@/components/app-document";
import { ErrorMessage, type ErrorPageProps } from "@/components/error-message";

// Replaces the root layout when the layout itself fails, and serves as the prerendered
// 500 page, so it brings its own styles and fonts
export default function GlobalError(props: ErrorPageProps) {
  return (
    <AppDocument>
      <title>Личная CRM</title>
      <ErrorMessage {...props} />
    </AppDocument>
  );
}
