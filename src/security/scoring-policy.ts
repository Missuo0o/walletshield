/** Server-owned assessment contract. Historical results retain their original
 * policy (or its absence); loading them never applies a new validation policy. */
export const SCORING_POLICY='muse-evidence-v6-field-bound-facts' as const;
