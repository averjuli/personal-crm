import "@fontsource-variable/manrope";
import "@fontsource-variable/unbounded";
import type { Metadata } from "next";
import "./globals.css";

import { AppDocument } from "@/components/app-document";

export const metadata: Metadata = {
  title: "Личная CRM",
  description: "Контакты людей, которых я знаю лично",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <AppDocument>{children}</AppDocument>;
}
