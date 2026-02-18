DROP TABLE `accounts`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
DROP TABLE `reminders`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_calendars`("id", "slug", "is_visible") SELECT "id", "slug", "is_visible" FROM `calendars`;--> statement-breakpoint
DROP TABLE `calendars`;--> statement-breakpoint
ALTER TABLE `__new_calendars` RENAME TO `calendars`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `calendars_slug_unique` ON `calendars` (`slug`);