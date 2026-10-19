import Link from "next/link";
export default function LoginButton({ next = "/" }: { next?: string }) {
  return <Link className="button button-outline" href={`/login?next=${encodeURIComponent(next)}`} prefetch={false}>Continue with Google</Link>;
}
