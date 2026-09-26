import { PrismaPg } from '@prisma/adapter-pg';

export function createAdapter(connectionString: string) {
  return new PrismaPg({ connectionString });
}
