import { z } from 'zod';
import { usAddressSchema } from '../../common/validation/address.validation';
import { emergencyContactsArraySchema } from '../../common/validation/emergencyContact.validation';
import { normalizeUsMobile } from '../../common/utils/phone.util';

const mobileField = z
  .string()
  .refine((val) => normalizeUsMobile(val) !== null, { message: 'Must be a valid USA mobile number' })
  .transform((val) => normalizeUsMobile(val) as string);

const baseFields = {
  ownerName: z.string().trim().min(1, 'Owner name is required'),
  ownerMobile: mobileField,
  ownerEmail: z.string().trim().email('A valid email address is required'),
  ...usAddressSchema.shape,
  emergencyContacts: emergencyContactsArraySchema.default([]),
  // When true, the QR is created and activated immediately with no Stripe checkout.
  skipPayment: z.boolean().optional().default(false),
};

const carDraftSchema = z.object({
  type: z.literal('CAR'),
  ...baseFields,
  vehicleNumber: z.string().trim().min(1, 'Vehicle number is required'),
  vehicleColor: z.string().trim().optional(),
  speedAlertEnabled: z.boolean().optional().default(false),
});

const dogDraftSchema = z.object({
  type: z.literal('DOG'),
  ...baseFields,
  name: z.string().trim().min(1, 'Dog name is required'),
  breed: z.string().trim().min(1, 'Breed is required'),
  photoUrl: z.string().url().optional(),
});

const luggageDraftSchema = z.object({
  type: z.literal('LUGGAGE'),
  ...baseFields,
  bagDescription: z.string().trim().min(1, 'Bag description is required'),
  imageUrl: z.string().url().optional(),
});

const otherDraftSchema = z.object({
  type: z.literal('OTHER'),
  ...baseFields,
  itemName: z.string().trim().min(1, 'Item name is required'),
  description: z.string().trim().min(1, 'Description is required'),
});

export const createQrDraftSchema = z.discriminatedUnion('type', [
  carDraftSchema,
  dogDraftSchema,
  luggageDraftSchema,
  otherDraftSchema,
]);

export type CreateQrDraftInput = z.infer<typeof createQrDraftSchema>;

// Editing an existing QR: same shape minus `type` (immutable after creation) and contacts
// are managed via the dedicated emergency-contacts endpoints, not bulk-replaced here.
export const updateQrInfoSchema = z.union([
  carDraftSchema.omit({ type: true, emergencyContacts: true }).partial(),
  dogDraftSchema.omit({ type: true, emergencyContacts: true }).partial(),
  luggageDraftSchema.omit({ type: true, emergencyContacts: true }).partial(),
  otherDraftSchema.omit({ type: true, emergencyContacts: true }).partial(),
]);
