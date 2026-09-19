import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    // `prisma generate` (npm postinstall) never connects, so a fresh clone or
    // CI must be able to run it without a database. An empty value can never
    // connect: migrate/status fail closed with P1013 until DATABASE_URL is set.
    url: process.env.DATABASE_URL ?? ""
  }
});
