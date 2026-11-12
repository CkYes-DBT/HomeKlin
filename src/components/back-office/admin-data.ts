import { cache } from "react";
import { listAdminJobs } from "@/lib/jobs/jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The admin console's reads (T26), with the signed-in admin's own session: admin_jobs() answers admins
// only. React's cache shares one read per request, so the recordings page asks the database once
// however many of its parts need the jobs. Call it only inside <RoleGate roles={["admin"]}>.
// Source: node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md ("Reusing data with React.cache")

export const getAdminJobs = cache(async () => listAdminJobs(await createSupabaseServerClient({ writeCookies: false })));
