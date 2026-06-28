"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = __importDefault(require("pg"));
const env_check_1 = require("./env-check");
(0, env_check_1.validateProductionEnvironment)();
const globalForPrisma = global;
const pool = new pg_1.default.Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgrespassword@localhost:5432/mp_office_db",
});
const adapter = new adapter_pg_1.PrismaPg(pool);
exports.prisma = globalForPrisma.prisma ||
    new client_1.PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production")
    globalForPrisma.prisma = exports.prisma;
