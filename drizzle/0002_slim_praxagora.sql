CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`type` varchar(64) NOT NULL,
	`title` varchar(256) NOT NULL,
	`body` text NOT NULL,
	`tone` varchar(16) NOT NULL DEFAULT 'blue',
	`isRead` int NOT NULL DEFAULT 0,
	`relatedId` varchar(128),
	`actionUrl` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
