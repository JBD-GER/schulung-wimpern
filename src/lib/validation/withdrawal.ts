import { z } from "zod";

const normalizedText = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .transform((value) => value.replace(/\s+/g, " "));

export const electronicWithdrawalSchema = z.object({
  submissionId: z.uuid(),
  consumerName: normalizedText(2, 160),
  contractReference: normalizedText(3, 240),
  confirmationEmail: z.email().trim().toLowerCase().max(254),
  confirmation: z.literal("withdrawal_confirmed"),
});

export type ElectronicWithdrawalInput = z.infer<
  typeof electronicWithdrawalSchema
>;
