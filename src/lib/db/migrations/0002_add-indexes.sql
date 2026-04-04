CREATE INDEX "idx_api_keys_created_by" ON "api_keys" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_api_keys_provider_user" ON "api_keys" USING btree ("provider","created_by");--> statement-breakpoint
CREATE INDEX "idx_generations_user_id" ON "generations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_generations_created_at" ON "generations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_generations_status" ON "generations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_images_generation_id" ON "images" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "idx_images_folder_id" ON "images" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "idx_images_created_at" ON "images" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_folders_user_id" ON "folders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_folders_parent_id" ON "folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_model_registry_provider" ON "model_registry" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_model_registry_provider_model" ON "model_registry" USING btree ("provider","model_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_is_read" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "idx_notifications_created_at" ON "notifications" USING btree ("created_at");