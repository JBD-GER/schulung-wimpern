import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase().max(254),
  topic: z.string().trim().min(2).max(120),
  message: z.string().trim().min(10).max(5000),
  privacyAccepted: z.literal(true, {
    error: "Bitte bestätige die Datenschutzerklärung.",
  }),
  website: z.string().max(0).optional().default(""),
});
