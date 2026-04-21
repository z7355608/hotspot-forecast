-- ============================================================
-- AI爆款预测 - 后台管理系统数据库表结构
-- Database: hotspot_forecast
-- MySQL 8.0 (兼容 5.7 语法)
-- Created: 2026-03-26
-- ============================================================

USE hotspot_forecast;

-- ------------------------------------------------------------
-- 1. 用户表 (user_profiles)
-- 核心用户数据，包含积分、会员等级等资产信息
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  id           VARCHAR(64)   NOT NULL PRIMARY KEY COMMENT '用户唯一ID',
  phone        VARCHAR(20)   NOT NULL COMMENT '手机号',
  nickname     VARCHAR(100)  NOT NULL DEFAULT '' COMMENT '昵称',
  membership_plan ENUM('free', 'monthly', 'yearly') NOT NULL DEFAULT 'free' COMMENT '会员等级: free/monthly/yearly',
  credits      INT           NOT NULL DEFAULT 0 COMMENT '当前积分余额',
  total_spent  INT           NOT NULL DEFAULT 0 COMMENT '累计消耗积分',
  total_earned INT           NOT NULL DEFAULT 0 COMMENT '累计获得积分',
  total_predictions INT      NOT NULL DEFAULT 0 COMMENT '累计预测次数',
  is_admin     TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否管理员 0=否 1=是',
  status       ENUM('active', 'inactive', 'banned') NOT NULL DEFAULT 'active' COMMENT '账号状态',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  last_active_at DATETIME    NULL DEFAULT NULL COMMENT '最后活跃时间',
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

  UNIQUE KEY uk_phone (phone),
  KEY idx_membership (membership_plan),
  KEY idx_status (status),
  KEY idx_created (created_at),
  KEY idx_last_active (last_active_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户资料表';

-- ------------------------------------------------------------
-- 2. 管理员白名单表 (admin_whitelist)
-- 独立于 user_profiles，用于快速校验管理员身份
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_whitelist (
  id           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  phone        VARCHAR(20)   NOT NULL COMMENT '管理员手机号',
  nickname     VARCHAR(100)  NOT NULL DEFAULT '' COMMENT '管理员昵称',
  is_active    TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '添加时间',
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

  UNIQUE KEY uk_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员白名单';

-- ------------------------------------------------------------
-- 3. 审计日志表 (audit_logs)
-- 记录所有管理后台的敏感操作
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id           VARCHAR(64)   NOT NULL PRIMARY KEY COMMENT '日志唯一ID',
  admin_phone  VARCHAR(20)   NOT NULL COMMENT '操作管理员手机号',
  action       VARCHAR(50)   NOT NULL COMMENT '操作类型: login/logout/user_update/config_update/credit_topup等',
  target       VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '操作目标（用户ID/配置项名等）',
  detail       TEXT          NULL COMMENT '操作详情（JSON格式，含旧值新值）',
  ip           VARCHAR(45)   NULL COMMENT '操作者IP地址',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',

  KEY idx_admin (admin_phone),
  KEY idx_action (action),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审计日志表';

-- ------------------------------------------------------------
-- 4. 系统配置表 (system_config)
-- 键值对形式存储系统配置，支持动态增减
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_config (
  config_key   VARCHAR(100)  NOT NULL PRIMARY KEY COMMENT '配置键',
  config_value TEXT          NOT NULL COMMENT '配置值（JSON字符串）',
  description  VARCHAR(500)  NULL COMMENT '配置说明',
  updated_by   VARCHAR(20)   NULL COMMENT '最后修改人手机号',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表';

-- ------------------------------------------------------------
-- 5. 积分流水表 (credit_transactions)
-- 记录每一笔积分变动，支持追溯和对账
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_transactions (
  id           VARCHAR(64)   NOT NULL PRIMARY KEY COMMENT '流水唯一ID',
  user_id      VARCHAR(64)   NOT NULL COMMENT '用户ID',
  type         ENUM('topup', 'consume', 'refund', 'admin_adjust', 'system_grant') NOT NULL COMMENT '流水类型',
  amount       INT           NOT NULL COMMENT '变动数量（正数增加，负数减少）',
  balance_after INT          NOT NULL COMMENT '变动后余额',
  reason       VARCHAR(500)  NULL COMMENT '变动原因',
  operator     VARCHAR(20)   NULL COMMENT '操作人（管理员手机号，系统操作为NULL）',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

  KEY idx_user (user_id),
  KEY idx_type (type),
  KEY idx_created (created_at),
  CONSTRAINT fk_credit_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分流水表';
