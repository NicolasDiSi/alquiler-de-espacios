import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/operator/format";

/**
 * The client's logo, or its initials when there is none or it does not load (spec 0005, AC-8). The logo is a URL the
 * operator pasted, so the browser asks for it without sending the app's address (`no-referrer`), and it is decorative.
 */
export function ClientAvatar({ name, logoUrl }: { readonly name: string; readonly logoUrl: string | null }) {
  return (
    <Avatar>
      {logoUrl ? <AvatarImage src={logoUrl} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback aria-hidden>{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
}
