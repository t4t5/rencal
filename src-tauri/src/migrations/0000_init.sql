CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`email` text,
	`access_token` text,
	`refresh_token` text,
	`expires_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_calendar_id` text,
	`name` text NOT NULL,
	`color` text,
	`selected` integer DEFAULT true NOT NULL,
	`sync_token` text,
	`last_synced_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_calendars_account_id` ON `calendars` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `calendars_account_id_provider_calendar_id_unique` ON `calendars` (`account_id`,`provider_calendar_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_event_id` text,
	`calendar_id` text NOT NULL,
	`summary` text,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`all_day` integer NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_events_calendar_id` ON `events` (`calendar_id`);--> statement-breakpoint
CREATE INDEX `idx_events_provider_event_id` ON `events` (`provider_event_id`);--> statement-breakpoint
CREATE INDEX `idx_events_start` ON `events` (`start`);