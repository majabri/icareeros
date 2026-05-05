/**
 * Global Privacy Control (GPC) detection.
 * https://globalprivacycontrol.org/
 *
 * GPC is interpreted as an opt-out of "sale" / "sharing" / cross-context ads
 * for US state laws (CCPA/CPRA, Colorado, Connecticut, etc.). For consent
 * purposes we treat it as: pre-set analytics + marketing to OFF.
 */
export function detectGPC(): boolean {
  if (typeof window === "undefined") return false;
  // Some browsers expose this on `navigator`; spec lets it be undefined.
  return Boolean((navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl);
}
