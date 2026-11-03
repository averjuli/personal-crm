import { signOutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

// Email of the signed-in user and «Выйти» for the right side of the header.
// Shows nothing on the sign-in pages
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  return (
    <div className="flex min-w-0 items-center gap-2 lg:gap-3">
      <span className="min-w-0 truncate text-sm text-muted-foreground">
        {user.email}
      </span>
      <form action={signOutAction}>
        <Button type="submit" variant="outline" size="sm">
          Выйти
        </Button>
      </form>
    </div>
  );
}
