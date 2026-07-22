CREATE TABLE IF NOT EXISTS site_pages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  route VARCHAR(255) NOT NULL UNIQUE,
  slug VARCHAR(160) NOT NULL,
  type VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  seo_title VARCHAR(255) NULL,
  seo_description TEXT NULL,
  hero_eyebrow VARCHAR(255) NULL,
  hero_title VARCHAR(255) NULL,
  hero_description TEXT NULL,
  hero_asset VARCHAR(512) NULL,
  hero_video JSON NULL,
  hero_height VARCHAR(32) NULL,
  hero_image_fit VARCHAR(32) NULL,
  hero_image_position_x TINYINT UNSIGNED NULL,
  hero_image_position_y TINYINT UNSIGNED NULL,
  hero_image_position_mobile_x TINYINT UNSIGNED NULL,
  hero_image_position_mobile_y TINYINT UNSIGNED NULL,
  hero_overlay_strength VARCHAR(32) NULL,
  hero_image_scale TINYINT UNSIGNED NULL,
  presentation LONGTEXT NULL CHECK (presentation IS NULL OR JSON_VALID(presentation)),
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_site_pages_status_route (status, route),
  INDEX idx_site_pages_type_slug (type, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_content_blocks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  page_id BIGINT UNSIGNED NOT NULL,
  block_key VARCHAR(255) NOT NULL,
  type VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body MEDIUMTEXT NULL,
  items JSON NULL,
  presentation LONGTEXT NULL CHECK (presentation IS NULL OR JSON_VALID(presentation)),
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'published',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_site_content_blocks_page FOREIGN KEY (page_id) REFERENCES site_pages(id) ON DELETE CASCADE,
  UNIQUE KEY uq_site_content_blocks_page_key (page_id, block_key),
  INDEX idx_site_content_blocks_page (page_id, status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_navigation_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  href VARCHAR(512) NOT NULL UNIQUE,
  target_type VARCHAR(32) NOT NULL DEFAULT 'legacy',
  target_page_id BIGINT UNSIGNED NULL,
  title_override VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'published',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_site_navigation_items_status_order (status, sort_order),
  INDEX idx_site_navigation_items_target_page (target_page_id),
  CONSTRAINT fk_site_navigation_items_target_page FOREIGN KEY (target_page_id) REFERENCES site_pages(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_settings (`key` VARCHAR(160) NOT NULL PRIMARY KEY, value JSON NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_admin_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'admin',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_media_assets (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, path VARCHAR(512) NOT NULL, alt VARCHAR(255) NULL, type VARCHAR(80) NULL, status VARCHAR(32) NOT NULL DEFAULT 'active', processing_status VARCHAR(32) NOT NULL DEFAULT 'ready', staging_path VARCHAR(1024) NULL, original_size_bytes BIGINT UNSIGNED NULL, final_size_bytes BIGINT UNSIGNED NULL, processing_error TEXT NULL, processing_progress_percent TINYINT UNSIGNED NULL, processing_progress_message VARCHAR(255) NULL, processing_progress_updated_at TIMESTAMP NULL, duration_seconds DECIMAL(10,3) NULL, width INT UNSIGNED NULL, height INT UNSIGNED NULL, processing_started_at TIMESTAMP NULL, processing_finished_at TIMESTAMP NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_site_media_processing (processing_status, id), INDEX idx_site_media_processing_claim (processing_status, status, processing_started_at, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS processing_status VARCHAR(32) NOT NULL DEFAULT 'ready';
ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS staging_path VARCHAR(1024) NULL;
ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS original_size_bytes BIGINT UNSIGNED NULL;
ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS final_size_bytes BIGINT UNSIGNED NULL;
ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS processing_error TEXT NULL;
ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS processing_progress_percent TINYINT UNSIGNED NULL;
ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS processing_progress_message VARCHAR(255) NULL;
ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS processing_progress_updated_at TIMESTAMP NULL;
ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS duration_seconds DECIMAL(10,3) NULL;
ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS width INT UNSIGNED NULL;
ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS height INT UNSIGNED NULL;
ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP NULL;
ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS processing_finished_at TIMESTAMP NULL;



CREATE TABLE IF NOT EXISTS site_publish_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_admin_id BIGINT UNSIGNED NULL,
  label VARCHAR(255) NULL,
  content_json LONGTEXT NOT NULL CHECK (JSON_VALID(content_json)),
  content_hash CHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'success',
  build_started_at TIMESTAMP NULL,
  build_finished_at TIMESTAMP NULL,
  build_log_excerpt TEXT NULL,
  release_path VARCHAR(1024) NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_site_publish_snapshots_status_created (status, created_at),
  INDEX idx_site_publish_snapshots_current (is_current)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS hero_height VARCHAR(32) NULL;
ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS hero_image_fit VARCHAR(32) NULL;
ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS hero_image_position_x TINYINT UNSIGNED NULL;
ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS hero_image_position_y TINYINT UNSIGNED NULL;
ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS hero_image_position_mobile_x TINYINT UNSIGNED NULL;
ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS hero_image_position_mobile_y TINYINT UNSIGNED NULL;
ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS hero_overlay_strength VARCHAR(32) NULL;
ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS hero_image_scale TINYINT UNSIGNED NULL;

ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS hero_video JSON NULL;

ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS presentation LONGTEXT NULL CHECK (presentation IS NULL OR JSON_VALID(presentation));
ALTER TABLE site_content_blocks ADD COLUMN IF NOT EXISTS presentation LONGTEXT NULL CHECK (presentation IS NULL OR JSON_VALID(presentation));
