import { readFile } from "node:fs/promises";
import pg from "pg";
import { RequestError } from "./http.js";

let poolPromise;

async function createPool() {
  const value = process.env.BABYCARE_DATABASE_URL;
  if (!value) throw new RequestError(503, "서버의 DB 연결 설정이 필요해요.");

  const url = new URL(value);
  if (!/^babycare_app(?:\.|$)/.test(decodeURIComponent(url.username))) {
    throw new RequestError(503, "서버에 babycare_app 전용 DB 계정을 설정해 주세요.");
  }
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);

  const ssl = { rejectUnauthorized: true };
  if (process.env.DATABASE_CA_PEM?.trim()) {
    ssl.ca = process.env.DATABASE_CA_PEM.replace(/\\n/g, "\n").trim();
  } else if (process.env.DATABASE_CA_FILE) {
    ssl.ca = await readFile(process.env.DATABASE_CA_FILE, "utf8");
  }

  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl,
    max: 1,
    connectionTimeoutMillis: 6000,
    statement_timeout: 8000,
  });
  pool.on("error", (error) => console.error("Babycare DB idle client", error.code ?? error.name));
  return pool;
}

export function getPool() {
  if (!poolPromise) {
    poolPromise = createPool().catch((error) => {
      poolPromise = undefined;
      throw error;
    });
  }
  return poolPromise;
}

export async function transaction(pool, operate) {
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query("begin");
    const result = await operate(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try { await client.query("rollback"); } catch (failure) { releaseError = failure; }
    throw error;
  } finally {
    client.release(releaseError);
  }
}
