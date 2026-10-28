import { supabase } from "@/lib/supabase";

import { AuthService } from "./AuthService";

export { AuthFailure, type AuthFailureKind } from "./AuthFailure";
export { type AuthClient, AuthService, type SignInResult, type SignUpResult } from "./AuthService";
export { type CredentialErrors, Credentials, type PasswordRuleStatus } from "./Credentials";

/** The app-wide auth service, backed by the shared Supabase client. */
export const authService = new AuthService(supabase.auth);
