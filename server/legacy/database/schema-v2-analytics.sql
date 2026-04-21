-- ============================================================
-- AI爆款预测 - 数据看板增强：统计分析表
-- 新增表：daily_stats (每日统计快照), user_login_logs (用户登录记录), revenue_records (收入记录)
-- MySQL 8.0 (兼容 5.7 语法)
-- Created: 2026-03-26
-- ============================================================

USE hotspot_forecast;

-- ------------------------------------------------------------
-- 6. 每日统计快照表 (daily_stats)
-- 每天定时聚合一次核心指标，供看板快速查询
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_stats (
  stat_date       DATE          NOT NULL PRIMARY KEY COMMENT '统计日期',
  dau             INT           NOT NULL DEFAULT 0 COMMENT '日活跃用户数',
  new_users       INT           NOT NULL DEFAULT 0 COMMENT '当日新增用户数',
  total_users     INT           NOT NULL DEFAULT 0 COMMENT '截止当日累计用户数',
  active_predictions INT        NOT NULL DEFAULT 0 COMMENT '当日预测次数',
  credits_consumed INT          NOT NULL DEFAULT 0 COMMENT '当日积分消耗',
  credits_topup   INT           NOT NULL DEFAULT 0 COMMENT '当日积分充值',
  revenue         DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '当日收入(元)',
  paid_users      INT           NOT NULL DEFAULT 0 COMMENT '当日付费用户数',
  free_count      INT           NOT NULL DEFAULT 0 COMMENT '免费用户数',
  monthly_count   INT           NOT NULL DEFAULT 0 COMMENT '月度会员数',
  yearly_count    INT           NOT NULL DEFAULT 0 COMMENT '年度会员数',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',

  KEY idx_stat_date (stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日统计快照';

-- ------------------------------------------------------------
-- 7. 用户登录/活跃记录表 (user_activity_logs)
-- 记录用户每次访问/登录，用于计算 DAU/WAU/MAU 和留存
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id         VARCHAR(64)   NOT NULL COMMENT '用户ID',
  activity_type   ENUM('login', 'visit', 'prediction', 'share') NOT NULL DEFAULT 'visit' COMMENT '活动类型',
  activity_date   DATE          NOT NULL COMMENT '活动日期',
  ip              VARCHAR(45)   NULL COMMENT 'IP地址',
  user_agent      VARCHAR(500)  NULL COMMENT '浏览器UA',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',

  KEY idx_user_date (user_id, activity_date),
  KEY idx_activity_date (activity_date),
  KEY idx_type_date (activity_type, activity_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户活动记录';

-- ------------------------------------------------------------
-- 8. 收入记录表 (revenue_records)
-- 记录每笔收入（会员购买、积分充值等）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revenue_records (
  id              VARCHAR(64)   NOT NULL PRIMARY KEY COMMENT '收入记录ID',
  user_id         VARCHAR(64)   NOT NULL COMMENT '用户ID',
  type            ENUM('membership_monthly', 'membership_yearly', 'credit_purchase', 'other') NOT NULL COMMENT '收入类型',
  amount          DECIMAL(12,2) NOT NULL COMMENT '金额(元)',
  description     VARCHAR(500)  NULL COMMENT '描述',
  payment_method  VARCHAR(50)   NULL DEFAULT 'wechat' COMMENT '支付方式',
  revenue_date    DATE          NOT NULL COMMENT '收入日期',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

  KEY idx_user (user_id),
  KEY idx_type (type),
  KEY idx_date (revenue_date),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收入记录表';
