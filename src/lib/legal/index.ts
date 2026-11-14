import * as WebBrowser from "expo-web-browser";

import { PrivacyPolicyLink } from "./PrivacyPolicyLink";

export { type OpenBrowser, type OpenResult, PRIVACY_POLICY_URL, PrivacyPolicyLink } from "./PrivacyPolicyLink";

/** The app-wide privacy policy link, backed by expo-web-browser. */
export const privacyPolicyLink = new PrivacyPolicyLink((url) => WebBrowser.openBrowserAsync(url));
