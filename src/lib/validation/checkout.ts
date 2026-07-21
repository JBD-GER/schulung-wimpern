import { z } from "zod";

export const checkoutIdentitySchema = z.object({
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  email: z.email().trim().toLowerCase().max(254),
});

export const checkoutSchema = z
  .object({
    billingType: z.enum(["private", "business"]),
    firstName: z.string().trim().min(2).max(100),
    lastName: z.string().trim().min(2).max(100),
    companyName: z.string().trim().max(160).optional(),
    contactPerson: z.string().trim().max(140).optional(),
    legalForm: z.string().trim().max(100).optional(),
    companyCountry: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase())
      .optional(),
    street: z.string().trim().min(3).max(160),
    postalCode: z.string().trim().min(2).max(20),
    city: z.string().trim().min(2).max(100),
    country: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase()),
    differentBillingAddress: z.boolean().optional().default(false),
    billingStreet: z.string().trim().max(160).optional(),
    billingPostalCode: z.string().trim().max(20).optional(),
    billingCity: z.string().trim().max(100).optional(),
    billingCountry: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase())
      .optional(),
    taxId: z.string().trim().max(40).optional(),
    termsAccepted: z.literal(true, { error: "Bitte akzeptiere die AGB." }),
    earlyAccessAccepted: z.literal(true, {
      error: "Bitte bestätige den vorzeitigen Beginn.",
    }),
    consentVersion: z.string().trim().min(1).max(50),
  })
  .superRefine((value, context) => {
    if (value.billingType === "business" && !value.companyName) {
      context.addIssue({
        code: "custom",
        path: ["companyName"],
        message: "Bitte gib den Firmennamen an.",
      });
    }
    if (value.billingType === "business" && !value.companyCountry) {
      context.addIssue({
        code: "custom",
        path: ["companyCountry"],
        message: "Bitte gib das Unternehmensland an.",
      });
    }
    if (
      value.billingType === "business" &&
      `${value.companyName ?? ""} ${value.legalForm ?? ""}`.trim().length > 255
    ) {
      context.addIssue({
        code: "custom",
        path: ["legalForm"],
        message:
          "Firmenname und Rechtsform dürfen zusammen höchstens 255 Zeichen lang sein.",
      });
    }
    if (value.billingType === "business" && value.differentBillingAddress) {
      if (!value.billingStreet || value.billingStreet.length < 3) {
        context.addIssue({
          code: "custom",
          path: ["billingStreet"],
          message: "Bitte gib Straße und Hausnummer der Rechnungsadresse an.",
        });
      }
      if (!value.billingPostalCode || value.billingPostalCode.length < 2) {
        context.addIssue({
          code: "custom",
          path: ["billingPostalCode"],
          message: "Bitte gib die Postleitzahl der Rechnungsadresse an.",
        });
      }
      if (!value.billingCity || value.billingCity.length < 2) {
        context.addIssue({
          code: "custom",
          path: ["billingCity"],
          message: "Bitte gib den Ort der Rechnungsadresse an.",
        });
      }
      if (!value.billingCountry) {
        context.addIssue({
          code: "custom",
          path: ["billingCountry"],
          message: "Bitte gib das Land der Rechnungsadresse an.",
        });
      }
    }
  });
