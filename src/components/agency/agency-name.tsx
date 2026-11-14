import { AgencyError, getMyAgency } from "@/lib/agency/agency";
import { getCurrentUser } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The signed-in agency's own name, for the role card of the agency sidebar (D2). getCurrentUser waits
// for the real request (connection()), so nothing here runs in a prerender; my_agency() answers an
// agency user with its own agency only, so this shows no one else's data. Anyone else, a sign-in
// without an agency, or a failed read shows the fallback.
export async function AgencyName({ fallback }: { fallback: string }) {
  const user = await getCurrentUser();
  if (user?.role !== "agency") return fallback;
  try {
    const client = await createSupabaseServerClient({ writeCookies: false });
    return (await getMyAgency(client))?.name ?? fallback;
  } catch (error) {
    if (!(error instanceof AgencyError)) throw error;
    console.error(error);
    return fallback;
  }
}
