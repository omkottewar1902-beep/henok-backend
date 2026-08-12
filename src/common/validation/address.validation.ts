import { z } from 'zod';

export const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
] as const;

export const usAddressSchema = z.object({
  addressLine1: z.string().trim().min(3, 'Street address is required'),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().min(1, 'City is required'),
  state: z.enum(US_STATE_CODES, { errorMap: () => ({ message: 'Must be a valid 2-letter USPS state code' }) }),
  zipCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'ZIP code must be 5 digits or ZIP+4 (12345-6789)'),
});

export type UsAddress = z.infer<typeof usAddressSchema>;
