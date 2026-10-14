-- ============================================================
-- IM 即时通讯系统 MySQL 初始化脚本
-- 数据库: im_system
-- ============================================================

CREATE DATABASE IF NOT EXISTS `im_system`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `im_system`;

-- ---------------------------------------------------------
-- 用户表
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(64)     NOT NULL COMMENT '登录账号',
  `password_hash` VARCHAR(255)    NOT NULL COMMENT 'bcrypt hash',
  `nickname`      VARCHAR(64)              DEFAULT NULL COMMENT '显示昵称',
  `avatar`        VARCHAR(512)             DEFAULT NULL COMMENT '头像 URL',
  `status`        TINYINT         NOT NULL DEFAULT 1 COMMENT '1=正常 0=禁用',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户';

-- ---------------------------------------------------------
-- 好友关系表（双向写入：user_id 关注 friend_id 是好友关系的一边）
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `friends` (
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `friend_id`  BIGINT UNSIGNED NOT NULL,
  `remark`     VARCHAR(64)              DEFAULT NULL COMMENT '好友备注',
  `status`     ENUM('pending','accepted','blocked') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `friend_id`),
  KEY `idx_friend_id` (`friend_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='好友关系';

-- ---------------------------------------------------------
-- 群组表
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `groups` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(64)     NOT NULL COMMENT '群名称',
  `avatar`        VARCHAR(512)             DEFAULT NULL,
  `owner_id`      BIGINT UNSIGNED NOT NULL COMMENT '群主 user_id',
  `member_count`  INT UNSIGNED    NOT NULL DEFAULT 0,
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_owner_id` (`owner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='群组';

-- ---------------------------------------------------------
-- 群成员表
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `members` (
  `group_id`   BIGINT UNSIGNED NOT NULL,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `nickname`   VARCHAR(64)              DEFAULT NULL COMMENT '群内昵称',
  `role`       ENUM('owner','admin','member') NOT NULL DEFAULT 'member',
  `joined_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`group_id`, `user_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='群成员';
