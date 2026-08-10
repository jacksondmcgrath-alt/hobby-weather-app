import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export type SupabaseAdminClient = any;

export type AuthenticatedApiRequest = {
  ok: true;
  user: User;
  admin: SupabaseAdminClient;
  accessToken: string;
};

export type FailedApiRequest = {
  ok: false;
  response: NextResponse;
};

export type AuthenticateApiRequestResult =
  | AuthenticatedApiRequest
  | FailedApiRequest;

export function getSupabaseServerEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "Server is missing Supabase environment variables.",
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
  };
}

export function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.replace("Bearer ", "");
}

export function createSupabaseAdminClient({
  supabaseUrl,
  supabaseServiceRoleKey,
}: {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}) {
  return createClient(
    supabaseUrl,
    supabaseServiceRoleKey
  ) as SupabaseAdminClient;
}

export async function authenticateApiRequest(
  request: NextRequest
): Promise<AuthenticateApiRequestResult> {
  const env = getSupabaseServerEnv();

  if (!env.ok) {
    return env;
  }

  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 }
      ),
    };
  }

  const authClient = createClient(env.supabaseUrl, env.supabaseAnonKey);

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Could not verify user." },
        { status: 401 }
      ),
    };
  }

  const admin = createSupabaseAdminClient({
    supabaseUrl: env.supabaseUrl,
    supabaseServiceRoleKey: env.supabaseServiceRoleKey,
  });

  return {
    ok: true,
    user,
    admin,
    accessToken,
  };
}