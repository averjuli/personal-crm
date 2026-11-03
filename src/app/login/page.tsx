import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/session";

export default function LoginPage() {
  return (
    <div className="grid max-w-md gap-6">
      <h1 className="font-heading text-title font-medium lg:text-title-lg">
        Вход
      </h1>
      <p className="text-muted-foreground">
        Пришлём ссылку для входа на почту. Пароль не нужен.
      </p>
      <Suspense fallback={null}>
        <LoginContent />
      </Suspense>
    </div>
  );
}

// Someone who is already signed in goes to the main page
async function LoginContent() {
  if (await getCurrentUser()) {
    redirect("/");
  }
  return <LoginForm />;
}
