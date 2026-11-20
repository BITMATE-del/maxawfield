import crypto from "node:crypto";
function secret(){if(!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length<32)throw Error("SESSION_SECRET는 32자 이상이어야 합니다.");return process.env.SESSION_SECRET}
function sign(value){return crypto.createHmac("sha256",secret()).update(value).digest("hex")}
export function issueSession(){const expires=Date.now()+1000*60*60*12;const payload=String(expires);return payload+"."+sign(payload)}
export function validSession(value){if(!value||typeof value!=="string")return false;const [expires,signature]=value.split(".");if(!expires||!signature||!/^\d+$/.test(expires)||Number(expires)<Date.now())return false;const expected=sign(expires);return signature.length===expected.length&&crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))}
export function passwordMatches(candidate){const actual=process.env.ADMIN_PASSWORD;if(!actual||actual.length<12)throw Error("ADMIN_PASSWORD는 12자 이상이어야 합니다.");const a=crypto.createHash("sha256").update(String(candidate)).digest();const b=crypto.createHash("sha256").update(actual).digest();return crypto.timingSafeEqual(a,b)}
