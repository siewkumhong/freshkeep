CREATE TABLE `anonymous_upload_usage` (
	`household_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`analysis_count` integer DEFAULT 0 NOT NULL,
	`save_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`household_id`, `usage_date`),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
