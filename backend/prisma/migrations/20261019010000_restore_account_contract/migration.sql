-- 기존 표시 이름과 계정 데이터를 유지한다.
ALTER TABLE "public"."User" RENAME COLUMN "name" TO "nickName";
ALTER TABLE "public"."User" ADD COLUMN "referral_code" TEXT;
-- 기존 회원은 고유 PK 기반 코드로 채워 충돌 없이 보존한다.
UPDATE "public"."User" SET "referral_code" = 'U' || "id"::text;
ALTER TABLE "public"."User" ALTER COLUMN "referral_code" SET NOT NULL;
CREATE UNIQUE INDEX "User_referral_code_key" ON "public"."User"("referral_code");
