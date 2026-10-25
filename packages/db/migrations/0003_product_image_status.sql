CREATE TYPE "public"."product_image_status" AS ENUM('pending', 'ready', 'rejected');--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "status" "product_image_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_seller_s3_key_uidx" UNIQUE("seller_id","s3_key");
