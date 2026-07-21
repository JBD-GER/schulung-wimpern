import { z } from "zod";

export const videoTokenSchema = z.object({ lessonId: z.uuid() });

export const progressSchema = z.object({
  lessonId: z.uuid(),
  currentTime: z.number().finite().min(0),
  duration: z.number().finite().positive(),
});

export const quizSubmissionSchema = z.object({
  attemptId: z.uuid(),
  answers: z
    .array(z.object({ questionId: z.uuid(), optionId: z.uuid() }))
    .length(5)
    .refine(
      (answers) =>
        new Set(answers.map((answer) => answer.questionId)).size === 5,
      {
        message: "Alle fünf Fragen müssen genau einmal beantwortet werden.",
      },
    ),
});

export const certificateConfirmationSchema = z.object({
  participantName: z
    .string()
    .trim()
    .min(2)
    .max(160)
    .refine((value) => value.split(/\s+/u).length >= 2, {
      message: "Bitte gib Vor- und Nachnamen vollständig an.",
    }),
  singleIssuanceConfirmed: z.literal(true),
  correctionFeeNoticeConfirmed: z.literal(true),
});
