import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

export const prisma = new PrismaClient();

export async function logAudit(data: {
  userId?: string;
  userName: string;
  action: string;
  entityType: string;
  entityId?: string;
  details: string;
  ipAddress?: string;
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId: data.userId || null,
        userName: data.userName,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId || null,
        details: data.details,
        ipAddress: data.ipAddress || null,
      },
    });
  } catch (error: any) {
    console.error('Falha ao registrar log de auditoria no PostgreSQL:', error.message);
  }
}

export * from '@prisma/client';
