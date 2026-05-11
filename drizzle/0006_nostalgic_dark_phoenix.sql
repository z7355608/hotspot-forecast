CREATE TABLE `user_preferences` (
	`userOpenId` varchar(64) NOT NULL,
	`productUpdates` int NOT NULL DEFAULT 1,
	`taskCompleteEmail` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_preferences_userOpenId` PRIMARY KEY(`userOpenId`)
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`userAgent` varchar(512),
	`ip` varchar(64),
	`loginMethod` varchar(32),
	`lastActiveAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_sessions_id` PRIMARY KEY(`id`)
);
