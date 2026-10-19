import Link from "next/link";
import type { ReactNode } from "react";

// The page frame with the header, shared by the root layout and global-error.tsx
export function AppDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b">
          <div className="mx-auto flex w-full max-w-page items-center px-6 py-4 lg:px-10 lg:py-5">
            {/* Same logo as the landing header: lime dot with an ink outline */}
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 lg:gap-3"
            >
              <span
                aria-hidden="true"
                className="size-6.5 rounded-full border-[1.5px] border-foreground bg-primary lg:size-7.5"
              />
              <span className="font-heading text-[0.9375rem] font-semibold lg:text-lg">
                Личная CRM
              </span>
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-page flex-1 px-6 py-8 lg:px-10 lg:py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
