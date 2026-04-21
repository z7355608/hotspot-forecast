CREATE TABLE `analysis_timing` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` varchar(64) NOT NULL,
	`userOpenId` varchar(64),
	`promptSnippet` varchar(100),
	`platforms` varchar(256),
	`totalMs` int,
	`intentMs` int,
	`collectMs` int,
	`llmMs` int,
	`cacheHit` int NOT NULL DEFAULT 0,
	`status` varchar(32) NOT NULL DEFAULT 'success',
	`platformTimingsJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysis_timing_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prediction_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cacheKey` varchar(64) NOT NULL,
	`prompt` text NOT NULL,
	`platforms` varchar(256),
	`resultJson` text NOT NULL,
	`hitCount` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prediction_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `prediction_cache_cacheKey_unique` UNIQUE(`cacheKey`)
);
