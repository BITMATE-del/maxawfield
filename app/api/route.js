import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {db,ensureSchema} from "../../lib/db";
import {issueSession,validSession,passwordMatches} from "../../lib/auth";
import {S3Client,PutObjectCommand,GetObjectCommand} from "@aws-sdk/client-s3";
import {randomUUID} from "node:crypto";
function s3(){return new S3Client({region:process.env.S3_REGION||"auto",endpoint:process.env.S3_ENDPOINT,forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}})}
export const runtime="nodejs";
function response(data,status=200){return NextResponse.json(data,{status})}
async function authorized(){return validSession((await cookies()).get("maxaw_admin")?.value)}
async function products(){await ensureSchema();const r=await db().query("SELECT * FROM products ORDER BY featured DESC,created_at DESC");return r.rows}
export async function GET(req){try{const mode=new URL(req.url).searchParams.get("type");if(mode==="session")return response({authenticated:await authorized()});if(mode==="image"){const key=new URL(req.url).searchParams.get("key");if(!key||!/^products\/[a-z0-9-]+\.[a-z0-9]+$/.test(key))return response({error:"유효하지 않은 이미지"},400);try{const object=await s3().send(new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:key}));return new Response(object.Body.transformToWebStream(),{headers:{"Content-Type":object.ContentType||"image/jpeg","Cache-Control":"public, max-age=86400"}})}catch{return response({error:"이미지를 찾을 수 없습니다."},404)}}if(mode==="shop-config"){await ensureSchema();const [a,b]=await Promise.all([db().query("SELECT * FROM shop_categories ORDER BY sort_order,id"),db().query("SELECT * FROM shop_blocks ORDER BY sort_order,id")]);const isAdmin=await authorized();return response({categories:isAdmin?a.rows:a.rows.filter(x=>x.visible),blocks:isAdmin?b.rows:b.rows.filter(x=>x.visible)})}if(mode==="orders"){if(!await authorized())return response({error:"관리자 인증이 필요합니다."},401);await ensureSchema();return response({orders:(await db().query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200")).rows})}const all=await products();return response({products:await authorized()&&mode==="admin-products"?all:all.filter(x=>x.active)})}catch(e){console.error(e);return response({error:"데이터 연결을 확인해주세요."},503)}}
export async function POST(req){try{const mode=new URL(req.url).searchParams.get("action");if(mode==="login"){const body=await req.json();if(!passwordMatches(body.password))return response({error:"비밀번호가 올바르지 않습니다."},401);const res=response({ok:true});res.cookies.set("maxaw_admin",issueSession(),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:43200});return res}
if(mode==="logout"){const res=response({ok:true});res.cookies.delete("maxaw_admin");return res}
if(mode==="upload"){if(!await authorized())return response({error:"권한이 없습니다."},401);if(!process.env.S3_ENDPOINT||!process.env.S3_BUCKET||!process.env.S3_ACCESS_KEY_ID||!process.env.S3_SECRET_ACCESS_KEY)return response({error:"Railway 이미지 저장소 설정이 필요합니다."},503);const form=await req.formData();const file=form.get("file");if(!file||typeof file==="string"||!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)||file.size>8*1024*1024)return response({error:"8MB 이하 JPG, PNG, WEBP, GIF 이미지만 업로드할 수 있습니다."},400);const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"}[file.type];const key="products/"+randomUUID()+"."+ext;await s3().send(new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:key,Body:Buffer.from(await file.arrayBuffer()),ContentType:file.type}));return response({url:"/api?type=image&key="+encodeURIComponent(key)})}
await ensureSchema();
if(mode==="category"){
if(!await authorized())return response({error:"관리자 권한이 필요합니다."},401);
const b=await req.json(),name=String(b.name||"").trim();const parentId=b.parent_id?Number(b.parent_id):null,description=String(b.description||"").slice(0,500);if(parentId&&(!Number.isSafeInteger(parentId)||parentId===Number(b.id)))return response({error:"상위 카테고리를 확인해주세요."},400);
if(!name||name.length>60||["전체","인기 상품"].includes(name))return response({error:"카테고리명을 확인해주세요."},400);
try{
if(b.id){
const old=await db().query("SELECT name FROM shop_categories WHERE id=$1",[b.id]);
if(!old.rowCount)return response({error:"카테고리를 찾을 수 없습니다."},404);
await db().query("UPDATE shop_categories SET name=$1,sort_order=$2,visible=$3,parent_id=$5,description=$6 WHERE id=$4",[name,Math.trunc(Number(b.sort_order)||0),b.visible!==false,b.id,parentId,description]);
if(old.rows[0].name!==name){
await db().query("UPDATE products SET category=$1 WHERE category=$2",[name,old.rows[0].name]);
await db().query("UPDATE shop_blocks SET category=$1 WHERE category=$2",[name,old.rows[0].name]);
}
return response({ok:true});
}
await db().query("INSERT INTO shop_categories(name,sort_order,visible,parent_id,description) VALUES($1,$2,$3,$4,$5)",[name,Math.trunc(Number(b.sort_order)||0),b.visible!==false,parentId,description]);
return response({ok:true});
}catch(e){if(e.code==="23505")return response({error:"같은 이름이 이미 존재합니다."},409);throw e}
}
if(mode==="block"){
if(!await authorized())return response({error:"관리자 권한이 필요합니다."},401);
const b=await req.json();
if(!["hero","banner","text","products"].includes(b.type))return response({error:"지원하지 않는 블록입니다."},400);
const title=String(b.title||"").slice(0,180),subtitle=String(b.subtitle||"").slice(0,1000),image=String(b.image_url||"").slice(0,2000),buttonText=String(b.button_text||"").slice(0,80),link=String(b.button_link||"").slice(0,500),category=String(b.category||"").slice(0,60),background=/^#[0-9a-fA-F]{6}$/.test(b.background)?b.background:"#f5f6f7";
if(image&&!image.startsWith("/api?type=image&key=")&&!image.startsWith("https://"))return response({error:"이미지 주소는 HTTPS 또는 업로드 이미지여야 합니다."},400);
if(link&&!(link.startsWith("/")&&!link.startsWith("//"))&&!link.startsWith("https://"))return response({error:"버튼 링크 주소가 올바르지 않습니다."},400);
const values=[b.type,title,subtitle,image,buttonText,link,category,background,Math.trunc(Number(b.sort_order)||0),b.visible!==false];
if(b.id){const q=await db().query("UPDATE shop_blocks SET type=$1,title=$2,subtitle=$3,image_url=$4,button_text=$5,button_link=$6,category=$7,background=$8,sort_order=$9,visible=$10 WHERE id=$11 RETURNING id",[...values,b.id]);return q.rowCount?response({ok:true}):response({error:"블록을 찾을 수 없습니다."},404)}
await db().query("INSERT INTO shop_blocks(type,title,subtitle,image_url,button_text,button_link,category,background,sort_order,visible) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",values);
return response({ok:true});
}
if(mode==="product"){if(!await authorized())return response({error:"권한이 없습니다."},401);const p=await req.json();if(!p.title?.trim()||!Number.isSafeInteger(Number(p.price))||Number(p.price)<0)return response({error:"상품명과 판매가를 확인해주세요."},400);const values=[String(p.title).trim(),String(p.description||""),String(p.category||"기타"),String(p.brand||""),Number(p.price),p.compare_price==null||p.compare_price===""?null:Number(p.compare_price),Math.max(0,Math.floor(Number(p.stock)||0)),JSON.stringify(Array.isArray(p.images)?p.images:[]),JSON.stringify(Array.isArray(p.options)?p.options:[]),!!p.featured,p.active!==false];if(p.id){const q=await db().query("UPDATE products SET title=$1,description=$2,category=$3,brand=$4,price=$5,compare_price=$6,stock=$7,images=$8::jsonb,options=$9::jsonb,featured=$10,active=$11,updated_at=now() WHERE id=$12 RETURNING id",[...values,p.id]);if(!q.rowCount)return response({error:"상품이 없습니다."},404);return response({id:q.rows[0].id})}const q=await db().query("INSERT INTO products(title,description,category,brand,price,compare_price,stock,images,options,featured,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11) RETURNING id",values);return response({id:q.rows[0].id})}
if(mode==="order"){const b=await req.json();if(!b.name?.trim()||!b.phone?.trim()||!b.address?.trim()||!Array.isArray(b.items)||!b.items.length||b.items.length>50)return response({error:"주문 정보를 확인해주세요."},400);const ids=[...new Set(b.items.map(i=>Number(i.id)))];if(ids.some(i=>!Number.isSafeInteger(i)))return response({error:"상품이 올바르지 않습니다."},400);const client=await db().connect();try{await client.query("BEGIN");const result=await client.query("SELECT id,title,price,stock,active,options FROM products WHERE id=ANY($1::bigint[]) FOR UPDATE",[ids]);const map=new Map(result.rows.map(x=>[Number(x.id),x]));let total=0;const lines=[];const qtyPerProduct=new Map();for(const i of b.items){const p=map.get(Number(i.id)),qty=Number(i.qty);if(!p||!p.active||!Number.isInteger(qty)||qty<1||qty>99)throw Error("상품 또는 수량이 올바르지 않습니다.");const opt=String(i.option||"");if(Array.isArray(p.options)&&p.options.length&&!p.options.includes(opt))throw Error("상품 옵션을 다시 선택해주세요.");total+=p.price*qty;qtyPerProduct.set(Number(i.id),(qtyPerProduct.get(Number(i.id))||0)+qty);lines.push({id:p.id,title:p.title,price:p.price,qty,option:opt})}for(const [id,qty] of qtyPerProduct){if(map.get(id).stock<qty)throw Error("재고가 부족합니다.");await client.query("UPDATE products SET stock=stock-$1,updated_at=now() WHERE id=$2",[qty,id])}const saved=await client.query("INSERT INTO orders(customer_name,phone,address,memo,items,total) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING id",[String(b.name).trim().slice(0,100),String(b.phone).trim().slice(0,40),String(b.address).trim().slice(0,500),String(b.memo||"").slice(0,1000),JSON.stringify(lines),total]);await client.query("COMMIT");return response({orderId:saved.rows[0].id})}catch(e){await client.query("ROLLBACK");return response({error:e.message},400)}finally{client.release()}}
if(mode==="payment-link"){if(!await authorized())return response({error:"권한이 없습니다."},401);const b=await req.json();const id=Number(b.id),link=String(b.payment_link||"").trim();if(!Number.isSafeInteger(id)||id<1)return response({error:"주문 번호 오류"},400);if(link){try{const url=new URL(link);if(url.protocol!=="https:"||url.username||url.password||link.length>2000)throw Error("bad url")}catch{return response({error:"https:// 로 시작하는 올바른 결제 주소를 입력해주세요."},400)}}const q=await db().query("UPDATE orders SET payment_link=$1,payment_link_sent_at=NULL WHERE id=$2 RETURNING id",[link,id]);if(!q.rowCount)return response({error:"주문을 찾을 수 없습니다."},404);return response({ok:true})}
if(mode==="payment-link-sent"){if(!await authorized())return response({error:"권한이 없습니다."},401);const b=await req.json();const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return response({error:"주문 번호 오류"},400);const q=await db().query("UPDATE orders SET payment_link_sent_at=now(),status='결제안내' WHERE id=$1 AND payment_link <> '' RETURNING id",[id]);if(!q.rowCount)return response({error:"저장된 결제 링크가 없습니다."},400);return response({ok:true})}
if(mode==="order-status"){if(!await authorized())return response({error:"권한이 없습니다."},401);const b=await req.json();if(!["접수","확인","결제안내","입금확인","배송중","완료","취소"].includes(b.status))return response({error:"상태 오류"},400);await db().query("UPDATE orders SET status=$1 WHERE id=$2",[b.status,b.id]);return response({ok:true})}
return response({error:"잘못된 요청"},400)}catch(e){console.error(e);return response({error:"요청을 처리하지 못했습니다."},503)}}
export async function DELETE(req){if(!await authorized())return response({error:"권한이 없습니다."},401);try{await ensureSchema();const params=new URL(req.url).searchParams;const type=params.get("type");const id=Number(params.get("id"));if(!Number.isSafeInteger(id))return response({error:"상품 번호 오류"},400);if(type==="category"){
const f=await db().query("SELECT name FROM shop_categories WHERE id=$1",[id]);
if(!f.rowCount)return response({error:"카테고리가 없습니다."},404);
const name=f.rows[0].name;
const q=await db().query("SELECT COUNT(*)::int AS count FROM products WHERE category=$1",[name]);
if(q.rows[0].count>0)return response({error:"상품이 등록된 카테고리입니다. 상품 분류를 먼저 변경해주세요."},409);
await db().query("DELETE FROM shop_categories WHERE id=$1",[id]);
await db().query("UPDATE shop_blocks SET category='' WHERE category=$1",[name]);
return response({ok:true});
}
if(type==="block"){await db().query("DELETE FROM shop_blocks WHERE id=$1",[id]);return response({ok:true})}
await db().query("DELETE FROM products WHERE id=$1",[id]);return response({ok:true})}catch(e){return response({error:"삭제하지 못했습니다."},503)}}
