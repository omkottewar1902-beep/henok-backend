import swaggerJsdoc from 'swagger-jsdoc';
import { env } from '../config/env';

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: `${env.appName} API`,
      version: '1.0.0',
      description:
        'Emergency QR code backend: passwordless mobile auth, QR creation for Car/Dog/Luggage/Other, ' +
        'Stripe one-time payments, masked Twilio calling, scan/call history, blocked callers and in-house notifications.',
    },
    servers: [{ url: env.appBaseUrl }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/modules/**/*.routes.ts'],
});
