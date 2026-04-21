-- ============================================================
-- AI爆款预测 - 数据看板增强：模拟统计数据（过去90天）
-- ============================================================

USE hotspot_forecast;

-- 清空旧数据（如果有）
TRUNCATE TABLE daily_stats;
TRUNCATE TABLE user_activity_logs;
TRUNCATE TABLE revenue_records;

-- ============================================================
-- 使用存储过程批量生成过去90天的模拟数据
-- ============================================================

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS generate_analytics_data()
BEGIN
  DECLARE i INT DEFAULT 0;
  DECLARE cur_date DATE;
  DECLARE base_dau INT;
  DECLARE base_new INT;
  DECLARE base_revenue DECIMAL(12,2);
  DECLARE day_of_week INT;
  DECLARE growth_factor DECIMAL(5,3);
  DECLARE weekend_factor DECIMAL(5,3);
  DECLARE rand_factor DECIMAL(5,3);
  DECLARE v_dau INT;
  DECLARE v_new_users INT;
  DECLARE v_total_users INT;
  DECLARE v_predictions INT;
  DECLARE v_credits_consumed INT;
  DECLARE v_credits_topup INT;
  DECLARE v_revenue DECIMAL(12,2);
  DECLARE v_paid_users INT;
  DECLARE v_free INT;
  DECLARE v_monthly INT;
  DECLARE v_yearly INT;
  DECLARE j INT;
  DECLARE v_user_id VARCHAR(64);
  DECLARE v_rev_type VARCHAR(30);
  DECLARE v_rev_amount DECIMAL(12,2);
  
  -- 基础参数
  SET base_dau = 35;
  SET base_new = 5;
  SET base_revenue = 120.00;
  SET v_total_users = 200;
  
  WHILE i < 90 DO
    SET cur_date = DATE_SUB(CURDATE(), INTERVAL (89 - i) DAY);
    SET day_of_week = DAYOFWEEK(cur_date); -- 1=Sunday, 7=Saturday
    
    -- 增长因子：越近期数据越大（模拟产品增长）
    SET growth_factor = 1.0 + (i * 0.008);
    
    -- 周末因子：周末活跃度略低
    IF day_of_week IN (1, 7) THEN
      SET weekend_factor = 0.75;
    ELSE
      SET weekend_factor = 1.0;
    END IF;
    
    -- 随机波动 0.8 ~ 1.2
    SET rand_factor = 0.8 + (RAND() * 0.4);
    
    -- 计算当日指标
    SET v_dau = GREATEST(10, ROUND(base_dau * growth_factor * weekend_factor * rand_factor));
    SET v_new_users = GREATEST(1, ROUND(base_new * growth_factor * rand_factor));
    SET v_total_users = v_total_users + v_new_users;
    SET v_predictions = ROUND(v_dau * (2.5 + RAND() * 1.5));
    SET v_credits_consumed = ROUND(v_predictions * (8 + RAND() * 4));
    SET v_credits_topup = ROUND(v_credits_consumed * (0.6 + RAND() * 0.5));
    SET v_revenue = ROUND(base_revenue * growth_factor * weekend_factor * rand_factor, 2);
    SET v_paid_users = GREATEST(1, ROUND(v_dau * (0.15 + RAND() * 0.1)));
    
    -- 会员分布（随增长变化）
    SET v_yearly = GREATEST(2, ROUND(v_total_users * (0.08 + RAND() * 0.04)));
    SET v_monthly = GREATEST(3, ROUND(v_total_users * (0.15 + RAND() * 0.06)));
    SET v_free = v_total_users - v_monthly - v_yearly;
    
    -- 插入每日统计
    INSERT INTO daily_stats (stat_date, dau, new_users, total_users, active_predictions, 
      credits_consumed, credits_topup, revenue, paid_users, free_count, monthly_count, yearly_count)
    VALUES (cur_date, v_dau, v_new_users, v_total_users, v_predictions,
      v_credits_consumed, v_credits_topup, v_revenue, v_paid_users, v_free, v_monthly, v_yearly);
    
    -- 为每个活跃用户生成活动记录（取部分用户模拟）
    SET j = 0;
    WHILE j < LEAST(v_dau, 20) DO
      -- 从现有用户中随机选取
      SET v_user_id = CONCAT('user_', LPAD(FLOOR(1 + RAND() * 12), 3, '0'));
      
      INSERT INTO user_activity_logs (user_id, activity_type, activity_date, ip)
      VALUES (v_user_id, 
        ELT(1 + FLOOR(RAND() * 3), 'login', 'visit', 'prediction'),
        cur_date,
        CONCAT('192.168.', FLOOR(RAND() * 255), '.', FLOOR(RAND() * 255)));
      
      SET j = j + 1;
    END WHILE;
    
    -- 生成收入记录
    SET j = 0;
    WHILE j < v_paid_users DO
      SET v_user_id = CONCAT('user_', LPAD(FLOOR(1 + RAND() * 12), 3, '0'));
      
      -- 随机收入类型
      SET v_rev_type = ELT(1 + FLOOR(RAND() * 3), 'membership_monthly', 'membership_yearly', 'credit_purchase');
      
      IF v_rev_type = 'membership_monthly' THEN
        SET v_rev_amount = 29.90;
      ELSEIF v_rev_type = 'membership_yearly' THEN
        SET v_rev_amount = 199.00;
      ELSE
        SET v_rev_amount = ROUND(10 + RAND() * 90, 2);
      END IF;
      
      INSERT INTO revenue_records (id, user_id, type, amount, description, revenue_date)
      VALUES (
        CONCAT('rev_', DATE_FORMAT(cur_date, '%Y%m%d'), '_', LPAD(j, 4, '0')),
        v_user_id,
        v_rev_type,
        v_rev_amount,
        CONCAT(CASE v_rev_type 
          WHEN 'membership_monthly' THEN '月度会员购买'
          WHEN 'membership_yearly' THEN '年度会员购买'
          ELSE '积分充值'
        END),
        cur_date
      );
      
      SET j = j + 1;
    END WHILE;
    
    SET i = i + 1;
  END WHILE;
END //

DELIMITER ;

-- 执行存储过程
CALL generate_analytics_data();

-- 清理存储过程
DROP PROCEDURE IF EXISTS generate_analytics_data;

-- ============================================================
-- 补充：为现有用户生成最近30天的活动记录（确保留存计算有数据）
-- ============================================================

-- 为12个种子用户生成近30天的随机活动记录
INSERT INTO user_activity_logs (user_id, activity_type, activity_date, ip)
SELECT 
  up.id,
  ELT(1 + FLOOR(RAND() * 3), 'login', 'visit', 'prediction'),
  DATE_SUB(CURDATE(), INTERVAL days.d DAY),
  CONCAT('10.0.', FLOOR(RAND() * 255), '.', FLOOR(RAND() * 255))
FROM user_profiles up
CROSS JOIN (
  SELECT 0 AS d UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
  UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
  UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
  UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
  UNION SELECT 20 UNION SELECT 21 UNION SELECT 22 UNION SELECT 23 UNION SELECT 24
  UNION SELECT 25 UNION SELECT 26 UNION SELECT 27 UNION SELECT 28 UNION SELECT 29
) days
WHERE RAND() < 0.4;  -- 每个用户约40%的天数有活动（模拟真实场景）

-- 验证数据
SELECT '=== daily_stats ===' AS info;
SELECT COUNT(*) AS total_days, MIN(stat_date) AS earliest, MAX(stat_date) AS latest FROM daily_stats;

SELECT '=== user_activity_logs ===' AS info;
SELECT COUNT(*) AS total_records, COUNT(DISTINCT user_id) AS unique_users FROM user_activity_logs;

SELECT '=== revenue_records ===' AS info;
SELECT COUNT(*) AS total_records, SUM(amount) AS total_revenue FROM revenue_records;
