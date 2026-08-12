import { z } from 'zod';
import { emergencyContactSchema } from '../../common/validation/emergencyContact.validation';

export const createEmergencyContactSchema = emergencyContactSchema;
export const updateEmergencyContactSchema = emergencyContactSchema.partial();

export type EmergencyContactInput = z.infer<typeof createEmergencyContactSchema>;
