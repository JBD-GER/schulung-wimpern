import { z } from "zod";

const name = z.string().trim().min(2).max(100);
export const passwordSchema = z
  .string()
  .min(12, "Das Passwort muss mindestens 12 Zeichen lang sein.")
  .max(128)
  .regex(/\p{Ll}/u, "Mindestens ein Kleinbuchstabe ist erforderlich.")
  .regex(/\p{Lu}/u, "Mindestens ein Großbuchstabe ist erforderlich.")
  .regex(/\p{N}/u, "Mindestens eine Zahl ist erforderlich.")
  .regex(/[^\p{L}\p{N}]/u, "Mindestens ein Sonderzeichen ist erforderlich.");

export const signupSchema = z.object({
  firstName: name,
  lastName: name,
  email: z.email().trim().toLowerCase().max(254),
  password: passwordSchema,
  certificateName: z.string().trim().min(2).max(160).optional(),
});

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(1).max(128),
});

export const passwordResetSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
});
export const passwordUpdateSchema = z.object({ password: passwordSchema });
export const emailChangeSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  currentPassword: z.string().min(1).max(128),
});

export const accountUpdateSchema = z.object({
  firstName: name,
  lastName: name,
  phone: z.string().trim().max(40).optional().nullable(),
  certificateName: z.string().trim().min(2).max(160).optional().nullable(),
  currentPassword: z.string().min(1).max(128).optional(),
  billingType: z.enum(["private", "business"]).optional(),
  companyName: z.string().trim().max(160).optional().nullable(),
  contactPerson: z.string().trim().max(160).optional().nullable(),
  billingAddress: z
    .object({
      street: z.string().trim().min(3).max(160),
      postalCode: z.string().trim().min(2).max(20),
      city: z.string().trim().min(2).max(100),
      country: z
        .string()
        .trim()
        .length(2)
        .transform((value) => value.toUpperCase()),
    })
    .optional(),
  taxId: z.string().trim().max(40).optional().nullable(),
});
