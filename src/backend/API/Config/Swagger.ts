import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DugdhaSetu API Documentation',
      version: '1.0.0',
      description: 'API documentation for the DugdhaSetu Dairy Management System',
      contact: {
        name: 'DugdhaSetu Support',
        email: 'support@dugdhasetu.com',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'Main API Gateway',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/backend/index.ts', './src/backend/API/Controllers/*.ts'], // Path to the API docs
};

export const swaggerSpec = swaggerJsdoc(options);
