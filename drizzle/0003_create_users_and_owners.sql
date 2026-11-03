CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sign_in_emails" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sign_in_emails_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sign_in_emails_email_sent_at_idx" ON "sign_in_emails" USING btree ("email","sent_at");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Hand-written: existing contacts and groups go to the owner (OWNER_EMAIL, passed
-- by applyMigrations as the session setting crm.owner_email). Drizzle runs all
-- new migrations in one transaction, so a failure here leaves the database as it was
DO $$
DECLARE
  owner_email text := nullif(btrim(current_setting('crm.owner_email', true)), '');
  v_owner_id text;
BEGIN
  IF EXISTS (SELECT 1 FROM "contacts") OR EXISTS (SELECT 1 FROM "groups") THEN
    IF owner_email IS NULL THEN
      RAISE EXCEPTION 'OWNER_EMAIL is not set: the database has contacts and groups that need an owner. Set OWNER_EMAIL in .env and run the migrations again';
    END IF;
    SELECT "id" INTO v_owner_id FROM "users" WHERE "email" = owner_email;
    IF v_owner_id IS NULL THEN
      v_owner_id := gen_random_uuid()::text;
      INSERT INTO "users" ("id", "name", "email") VALUES (v_owner_id, '', owner_email);
    END IF;
    UPDATE "contacts" SET "owner_id" = v_owner_id;
    UPDATE "groups" SET "owner_id" = v_owner_id;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "groups_name_lower_idx";--> statement-breakpoint
CREATE INDEX "contacts_owner_id_idx" ON "contacts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "groups_owner_id_idx" ON "groups" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_owner_id_name_lower_idx" ON "groups" USING btree ("owner_id",lower("name"));