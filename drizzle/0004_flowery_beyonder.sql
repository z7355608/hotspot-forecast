CREATE TABLE `credit_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`amount` int NOT NULL,
	`balance` int NOT NULL,
	`type` enum('purchase','subscription','checkin','consume','refund','admin') NOT NULL,
	`description` varchar(256) NOT NULL,
	`relatedId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credit_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `daily_checkins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`checkinDate` varchar(10) NOT NULL,
	`creditsAwarded` int NOT NULL DEFAULT 5,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `daily_checkins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`plan` enum('plus','pro') NOT NULL,
	`billingCycle` enum('monthly_once','monthly_auto','yearly') NOT NULL,
	`status` enum('active','cancelled','expired') NOT NULL DEFAULT 'active',
	`startAt` timestamp NOT NULL,
	`endAt` timestamp NOT NULL,
	`autoRenew` int NOT NULL DEFAULT 0,
	`monthlyCredits` int NOT NULL DEFAULT 0,
	`amountCents` int NOT NULL DEFAULT 0,
	`paymentOrderId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
