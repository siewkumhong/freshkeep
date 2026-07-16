CREATE TABLE `household_members` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`invited_by` text,
	`activated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_members_household_email_unique` ON `household_members` (`household_id`,`email`);--> statement-breakpoint
CREATE INDEX `household_members_email_idx` ON `household_members` (`email`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Singapore' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`location` text NOT NULL,
	`date_type` text NOT NULL,
	`item_date` text NOT NULL,
	`reminder_on` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`photo_key` text NOT NULL,
	`photo_content_type` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `items_household_status_date_idx` ON `items` (`household_id`,`status`,`item_date`);--> statement-breakpoint
CREATE INDEX `items_reminder_idx` ON `items` (`status`,`reminder_on`);--> statement-breakpoint
CREATE TABLE `reminder_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`recipient_email` text NOT NULL,
	`reminder_on` text NOT NULL,
	`status` text NOT NULL,
	`provider_id` text,
	`attempts` integer DEFAULT 1 NOT NULL,
	`last_error` text,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_delivery_once_unique` ON `reminder_deliveries` (`item_id`,`recipient_email`,`reminder_on`);