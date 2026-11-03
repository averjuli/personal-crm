import "@fontsource-variable/manrope";
import "@fontsource-variable/unbounded";
import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";

import { AppDocument } from "@/components/app-document";
import { UserMenu } from "@/components/user-menu";

export const metadata: Metadata = {
  title: "Личная CRM",
  description: "Контакты людей, которых я знаю лично",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <AppDocument
      headerEnd={
        // Reads the session, so it waits behind Suspense and does not
        // hold back the rest of the page
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      }
    >
      {children}
    </AppDocument>
  );
}
