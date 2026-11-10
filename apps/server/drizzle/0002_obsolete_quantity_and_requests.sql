ALTER TYPE "public"."movement_reason" ADD VALUE 'transfer';--> statement-breakpoint
ALTER TYPE "public"."movement_reason" ADD VALUE 'disposal';--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "obsolete_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_obsolete_quantity_range_chk" CHECK ("labels"."obsolete_quantity" BETWEEN 0 AND "labels"."quantity");