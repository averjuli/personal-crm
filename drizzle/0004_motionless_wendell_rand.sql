ALTER TABLE "contacts" ADD COLUMN "birth_day" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_month" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_year" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birthday_check" CHECK (case
        when "contacts"."birth_day" is null and "contacts"."birth_month" is null and "contacts"."birth_year" is null then true
        when "contacts"."birth_day" is null or "contacts"."birth_month" is null then false
        else "contacts"."birth_month" between 1 and 12
          and ("contacts"."birth_year" is null or "contacts"."birth_year" > 0)
          and "contacts"."birth_day" between 1 and case
            when "contacts"."birth_month" = 2 then case
              when coalesce("contacts"."birth_year", 2000) % 400 = 0
                or (coalesce("contacts"."birth_year", 2000) % 4 = 0 and coalesce("contacts"."birth_year", 2000) % 100 <> 0)
              then 29 else 28 end
            when "contacts"."birth_month" in (4, 6, 9, 11) then 30
            else 31 end
        end);