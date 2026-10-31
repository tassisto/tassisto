ALTER TABLE `bookings` ADD `attendance_status` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `attendance_closed_at` text;--> statement-breakpoint
UPDATE `bookings` SET `attendance_status` = 'on_time' WHERE `attended_at` IS NOT NULL;
--> statement-breakpoint
UPDATE `sessions` SET `attendance_closed_at` = CURRENT_TIMESTAMP WHERE `starts_at` <= datetime('now', '-75 minutes') AND EXISTS (SELECT 1 FROM `bookings` WHERE `bookings`.`session_id` = `sessions`.`id` AND `bookings`.`attended_at` IS NOT NULL);
