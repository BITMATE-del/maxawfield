import pg from "pg";
const globalForDb=globalThis;
export function db(){if(!process.env.DATABASE_URL)throw Error("DATABASE_URL 환경변수가 필요합니다.");if(!globalForDb.maxawPool)globalForDb.maxawPool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes("localhost")?false:{rejectUnauthorized:false},max:5});return globalForDb.maxawPool;}
let initPromise;
export async function ensureSchema(){if(!initPromise)initPromise=(async()=>{await db().query(`CREATE TABLE IF NOT EXISTS products (
id BIGSERIAL PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT '기타',brand TEXT NOT NULL DEFAULT '',price INTEGER NOT NULL CHECK(price>=0),compare_price INTEGER,stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),images JSONB NOT NULL DEFAULT '[]',options JSONB NOT NULL DEFAULT '[]',featured BOOLEAN NOT NULL DEFAULT FALSE,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS orders (id BIGSERIAL PRIMARY KEY,customer_name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,memo TEXT NOT NULL DEFAULT '',items JSONB NOT NULL,total INTEGER NOT NULL,status TEXT NOT NULL DEFAULT '접수',created_at TIMESTAMPTZ NOT NULL DEFAULT now());`);})();try{await initPromise}catch(e){initPromise=null;throw e}}
