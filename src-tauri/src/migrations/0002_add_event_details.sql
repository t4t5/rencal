CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`minutes` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_reminders_event_id` ON `reminders` (`event_id`);--> statement-breakpoint
ALTER TABLE `events` ADD `location` text;--> statement-breakpoint
ALTER TABLE `events` ADD `status` text;--> statement-breakpoint
ALTER TABLE `events` ADD `organizer_email` text;