const missing = (name: string): never => {
  throw new Error(
    `Die erforderliche Umgebungsvariable ${name} ist nicht konfiguriert.`,
  );
};

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  return value || missing(name);
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function envFlag(name: string, fallback = false): boolean {
  const value = optionalEnv(name);
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function getSiteUrl(): string {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL muss eine gültige absolute URL sein.",
    );
  }
}

export function getPublicSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY müssen konfiguriert sein.",
    );
  }
  return { url, anonKey };
}

export function getServerSupabaseConfig(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const url =
    optionalEnv("SUPABASE_URL") ?? optionalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey =
    optionalEnv("SUPABASE_ANON_KEY") ??
    optionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url) return missing("SUPABASE_URL (oder NEXT_PUBLIC_SUPABASE_URL)");
  if (!anonKey)
    return missing("SUPABASE_ANON_KEY (oder NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  return {
    url,
    anonKey,
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getAdminEmails(): Set<string> {
  return new Set(
    (optionalEnv("ADMIN_EMAILS") ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
