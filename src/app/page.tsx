import { redirect } from "next/navigation";

// Root redirects authenticated users → dashboard, unauthenticated → login
// Middleware handles the auth check; this catches direct / visits
export default function RootPage() {
  redirect("/dashboard");
}
