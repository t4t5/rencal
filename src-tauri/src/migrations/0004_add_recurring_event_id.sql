ALTER TABLE `events` ADD `recurring_event_id` text REFERENCES events(id);--> statement-breakpoint
CREATE INDEX `idx_events_recurring_event_id` ON `events` (`recurring_event_id`);