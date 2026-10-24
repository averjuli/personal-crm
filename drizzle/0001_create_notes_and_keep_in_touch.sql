CREATE TABLE "notes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"contact_id" integer NOT NULL,
	"body" text NOT NULL,
	"noted_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "contact_frequency" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "frequency_set_on" date;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "contacted_on" date;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "skipped_on" date;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_contact_id_noted_on_idx" ON "notes" USING btree ("contact_id","noted_on" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_contact_frequency_check" CHECK ("contacts"."contact_frequency" in ('week', 'month', 'quarter', 'year'));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_frequency_set_on_check" CHECK (("contacts"."contact_frequency" is null) = ("contacts"."frequency_set_on" is null));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_skipped_on_check" CHECK ("contacts"."skipped_on" is null or "contacts"."contact_frequency" is not null);
--> statement-breakpoint
-- Move the old free-text notes into the notes table, one note per contact
INSERT INTO "notes" ("contact_id", "body", "noted_on", "created_at", "updated_at")
SELECT "id", "notes", ("updated_at" AT TIME ZONE 'Europe/Moscow')::date, "updated_at", "updated_at"
FROM "contacts"
WHERE "notes" ~ '\S';
