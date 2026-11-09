CREATE TYPE "public"."movement_reason" AS ENUM('created', 'print', 'consumption', 'inventory', 'correction');--> statement-breakpoint
CREATE TABLE "counterparties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "counterparties_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"counterparty_id" uuid NOT NULL,
	"layout_number" text,
	"barcode" text,
	"printed_at" date NOT NULL,
	"quantity" integer NOT NULL,
	"comment" text,
	"version" integer DEFAULT 1 NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "labels_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "labels_layout_number_digits_chk" CHECK ("labels"."layout_number" ~ '^[0-9]+$'),
	CONSTRAINT "labels_quantity_non_negative_chk" CHECK ("labels"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"quantity_after" integer NOT NULL,
	"reason" "movement_reason" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_delta_non_zero_chk" CHECK ("stock_movements"."delta" <> 0)
);
--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "counterparties_name_normalized_uq" ON "counterparties" USING btree (lower(trim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "labels_layout_number_active_uq" ON "labels" USING btree ("layout_number") WHERE "labels"."deleted_at" IS NULL AND "labels"."layout_number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_barcode_active_uq" ON "labels" USING btree ("barcode") WHERE "labels"."deleted_at" IS NULL AND "labels"."barcode" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "labels_counterparty_id_idx" ON "labels" USING btree ("counterparty_id");--> statement-breakpoint
CREATE INDEX "labels_updated_at_idx" ON "labels" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "stock_movements_label_id_created_at_idx" ON "stock_movements" USING btree ("label_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements" USING btree ("created_at");