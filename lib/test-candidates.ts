/**
 * Whether a run answers eligibility and attestation questions with the most
 * favorable option instead of from the candidate's profile.
 *
 * POSITIVE_ANSWERS=1 is an operator setting: the operator has confirmed that the
 * candidates in the queue consented to this. It is set per environment, so it
 * must be enabled deliberately wherever the worker runs.
 */

export const DRY_RUN = process.env.KERNEL_DRY_RUN === "1"

export function usesPositiveAnswers(): boolean {
  return DRY_RUN || process.env.POSITIVE_ANSWERS === "1"
}
