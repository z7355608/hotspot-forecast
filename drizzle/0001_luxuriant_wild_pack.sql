CREATE TABLE `content_calendar` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`strategySessionId` varchar(64),
	`track` varchar(128) NOT NULL,
	`scheduledDate` varchar(10) NOT NULL,
	`scheduledTime` varchar(5),
	`topicTitle` text NOT NULL,
	`directionName` varchar(256),
	`contentAngle` text,
	`hookType` varchar(64),
	`scriptNotes` text,
	`contentType` enum('main','test','backup') NOT NULL DEFAULT 'main',
	`status` enum('planned','filmed','published','skipped') NOT NULL DEFAULT 'planned',
	`platform` varchar(32),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `content_calendar_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_performance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publishedContentId` int NOT NULL,
	`checkpoint` varchar(16) NOT NULL,
	`viewCount` int DEFAULT 0,
	`likeCount` int DEFAULT 0,
	`commentCount` int DEFAULT 0,
	`shareCount` int DEFAULT 0,
	`collectCount` int DEFAULT 0,
	`collectedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_performance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `published_content` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`calendarItemId` int,
	`strategySessionId` varchar(64),
	`directionName` varchar(256),
	`platform` varchar(32) NOT NULL,
	`contentId` varchar(128),
	`contentUrl` text,
	`publishedTitle` text,
	`predictedScore` int,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `published_content_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weekly_topic_subscription` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`track` varchar(128) NOT NULL,
	`platforms` varchar(256),
	`accountStage` varchar(32),
	`enabled` int NOT NULL DEFAULT 1,
	`lastRunAt` timestamp,
	`lastRunSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_topic_subscription_id` PRIMARY KEY(`id`)
);
