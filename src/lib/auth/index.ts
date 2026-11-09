import { supabase } from "@/lib/supabase";

import { AccountDeletionClient } from "./AccountDeletionClient";
import { AuthService } from "./AuthService";

export {
  AccountDeletionClient,
  DELETE_CONFIRMATION_WORD,
  type DeletionResult,
  type InvokeDeleteFunction,
} from "./AccountDeletionClient";
export { AuthFailure, type AuthFailureKind } from "./AuthFailure";
export { type AuthClient, AuthService, type SignInResult, type SignUpResult } from "./AuthService";
export { type CredentialErrors, Credentials, type PasswordRuleStatus } from "./Credentials";

/** The app-wide auth service, backed by the shared Supabase client. */
export const authService = new AuthService(supabase.auth);

/** Deletes the signed-in account through the delete-account Edge Function, then signs out. */
export const accountDeletion = new AccountDeletionClient(
  (name, options) => supabase.functions.invoke(name, options),
  () => authService.signOut(),
);
