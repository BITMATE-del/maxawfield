import pg from "pg";
const globalForDb=globalThis;
export function db(){if(!process.env.DATABASE_URL)throw Error("DATABASE_URL 환경변수가 필요합니다.");if(!globalForDb.maxawPool)globalForDb.maxawPool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes("localhost")?false:{rejectUnauthorized:false},max:5});return globalForDb.maxawPool;}
let initPromise;
export async function ensureSchema(){if(!initPromise)initPromise=(async()=>{await db().query(`CREATE TABLE IF NOT EXISTS products (
id BIGSERIAL PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT '기타',brand TEXT NOT NULL DEFAULT '',price INTEGER NOT NULL CHECK(price>=0),compare_price INTEGER,stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),images JSONB NOT NULL DEFAULT '[]',options JSONB NOT NULL DEFAULT '[]',featured BOOLEAN NOT NULL DEFAULT FALSE,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS orders (id BIGSERIAL PRIMARY KEY,customer_name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,memo TEXT NOT NULL DEFAULT '',items JSONB NOT NULL,total INTEGER NOT NULL,status TEXT NOT NULL DEFAULT '접수',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_link TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_link_sent_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS shop_bootstrap (id INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS shop_categories (id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL UNIQUE,sort_order INTEGER NOT NULL DEFAULT 0,visible BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS shop_blocks (id BIGSERIAL PRIMARY KEY,type TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',subtitle TEXT NOT NULL DEFAULT '',image_url TEXT NOT NULL DEFAULT '',button_text TEXT NOT NULL DEFAULT '',button_link TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT '',background TEXT NOT NULL DEFAULT '#f5f6f7',sort_order INTEGER NOT NULL DEFAULT 0,visible BOOLEAN NOT NULL DEFAULT true);
INSERT INTO shop_categories(name,sort_order) SELECT v.name,v.sort_order FROM (VALUES ('다저스 컬렉션',10),('야구·소프트볼 용품',20),('스포츠 의류',30),('야구모자',40),('MLB 굿즈',50),('기타',60)) AS v(name,sort_order) WHERE NOT EXISTS(SELECT 1 FROM shop_bootstrap) ON CONFLICT(name) DO NOTHING;
INSERT INTO shop_blocks(type,title,subtitle,sort_order) SELECT 'hero','PLAY WITH CONFIDENCE.','좋은 플레이는 좋은 장비에서 시작됩니다.',10 WHERE NOT EXISTS(SELECT 1 FROM shop_blocks) AND NOT EXISTS(SELECT 1 FROM shop_bootstrap);
INSERT INTO shop_blocks(type,title,subtitle,sort_order) SELECT 'products','엄선된 베이스볼 컬렉션','MAXAW FIELD 베이스볼 컬렉션',20 WHERE NOT EXISTS(SELECT 1 FROM shop_blocks WHERE type='products') AND NOT EXISTS(SELECT 1 FROM shop_bootstrap);
INSERT INTO shop_bootstrap(id) VALUES (1) ON CONFLICT DO NOTHING;`);})();try{await initPromise}catch(e){initPromise=null;throw e}}
