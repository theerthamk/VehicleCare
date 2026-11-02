-- ============================================================
-- VehicleCare database schema (MySQL 8.0+)
--
-- WARNING: importing this file DROPS and re-creates every
-- VehicleCare table, so all existing data is deleted.
--
-- Import with:   npm run db:init
-- or (PowerShell): Get-Content database\schema.sql | mysql -u root -p
-- ============================================================

CREATE DATABASE IF NOT EXISTS vehiclecare
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE vehiclecare;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS ai_messages;
DROP TABLE IF EXISTS job_bids;
DROP TABLE IF EXISTS job_posts;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS record_photos;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS maintenance_records;
DROP TABLE IF EXISTS service_requests;
DROP TABLE IF EXISTS maintenance_tasks;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------
-- users: vehicle owners and caretakers / service providers.
-- The provider-profile columns (phone .. bio) are used by caretakers.
-- ------------------------------------------------------------
CREATE TABLE users (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name       VARCHAR(100) NOT NULL,
  email           VARCHAR(150) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('owner', 'caretaker') NOT NULL,
  phone           VARCHAR(20)  NULL,
  city            VARCHAR(80)  NULL,
  specialization  VARCHAR(120) NULL,
  bio             VARCHAR(500) NULL,
  latitude        DECIMAL(9, 6) NULL,
  longitude       DECIMAL(9, 6) NULL,
  service_radius_km SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  CONSTRAINT chk_users_radius CHECK (service_radius_km BETWEEN 1 AND 200)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- vehicles: always belong to exactly one owner.
-- Registration numbers are unique per owner.
-- ------------------------------------------------------------
CREATE TABLE vehicles (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id             INT UNSIGNED NOT NULL,
  make                 VARCHAR(60)  NOT NULL,
  model                VARCHAR(60)  NOT NULL,
  year                 SMALLINT UNSIGNED NULL,
  registration_number  VARCHAR(20)  NOT NULL,
  vehicle_type         ENUM('car', 'motorcycle', 'scooter', 'truck', 'van', 'other') NOT NULL DEFAULT 'car',
  status               ENUM('active', 'parked', 'in_service', 'stored') NOT NULL DEFAULT 'parked',
  parked_since         DATE NULL,
  location             VARCHAR(150) NULL,
  latitude             DECIMAL(9, 6) NULL,
  longitude            DECIMAL(9, 6) NULL,
  notes                VARCHAR(500) NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vehicles_owner_reg (owner_id, registration_number),
  KEY idx_vehicles_status (status),
  CONSTRAINT fk_vehicles_owner FOREIGN KEY (owner_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- maintenance_tasks: planned work on a vehicle.
-- assigned_to is the caretaker responsible (NULL = owner does it).
-- reminder_sent_at stops the reminder service sending duplicates.
-- ------------------------------------------------------------
CREATE TABLE maintenance_tasks (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_id        INT UNSIGNED NOT NULL,
  assigned_to       INT UNSIGNED NULL,
  title             VARCHAR(120) NOT NULL,
  description       VARCHAR(1000) NULL,
  due_date          DATE NOT NULL,
  status            ENUM('pending', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  priority          ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  completed_at      DATETIME NULL,
  reminder_sent_at  DATETIME NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_vehicle_status (vehicle_id, status),
  KEY idx_tasks_assigned_status (assigned_to, status),
  KEY idx_tasks_due (status, due_date),
  CONSTRAINT fk_tasks_vehicle FOREIGN KEY (vehicle_id)
    REFERENCES vehicles (id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_assignee FOREIGN KEY (assigned_to)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- service_requests: an owner asks a provider to do a job.
-- When the provider accepts, a maintenance task is created and
-- linked through task_id; completing that task completes the request.
-- ------------------------------------------------------------
CREATE TABLE service_requests (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_id      INT UNSIGNED NOT NULL,
  owner_id        INT UNSIGNED NOT NULL,
  provider_id     INT UNSIGNED NOT NULL,
  task_id         INT UNSIGNED NULL,
  service_type    VARCHAR(100) NOT NULL,
  details         VARCHAR(1000) NULL,
  preferred_date  DATE NULL,
  request_date    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status          ENUM('pending', 'accepted', 'declined', 'cancelled', 'completed') NOT NULL DEFAULT 'pending',
  provider_note   VARCHAR(500) NULL,
  cost            DECIMAL(10, 2) NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_requests_task (task_id),
  KEY idx_requests_owner_status (owner_id, status),
  KEY idx_requests_provider_status (provider_id, status),
  KEY idx_requests_vehicle (vehicle_id),
  CONSTRAINT fk_requests_vehicle FOREIGN KEY (vehicle_id)
    REFERENCES vehicles (id) ON DELETE CASCADE,
  CONSTRAINT fk_requests_owner FOREIGN KEY (owner_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_requests_provider FOREIGN KEY (provider_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_requests_task FOREIGN KEY (task_id)
    REFERENCES maintenance_tasks (id) ON DELETE SET NULL,
  CONSTRAINT chk_requests_cost CHECK (cost IS NULL OR cost >= 0)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- maintenance_records: what was actually done (inspections and
-- completed maintenance), with notes and cost. Forms the history.
-- ------------------------------------------------------------
CREATE TABLE maintenance_records (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_id    INT UNSIGNED NOT NULL,
  task_id       INT UNSIGNED NULL,
  performed_by  INT UNSIGNED NULL,
  record_type   ENUM('inspection', 'maintenance') NOT NULL DEFAULT 'maintenance',
  service_date  DATE NOT NULL,
  notes         VARCHAR(1000) NULL,
  cost          DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ai_condition  ENUM('good', 'fair', 'poor') NULL,
  ai_report     JSON NULL,
  ai_source     ENUM('gemini', 'rules') NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_records_vehicle_date (vehicle_id, service_date),
  KEY idx_records_task (task_id),
  KEY idx_records_performer (performed_by, service_date),
  CONSTRAINT fk_records_vehicle FOREIGN KEY (vehicle_id)
    REFERENCES vehicles (id) ON DELETE CASCADE,
  CONSTRAINT fk_records_task FOREIGN KEY (task_id)
    REFERENCES maintenance_tasks (id) ON DELETE SET NULL,
  CONSTRAINT fk_records_performer FOREIGN KEY (performed_by)
    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_records_cost CHECK (cost >= 0)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- notifications: reminders and status updates for one user.
-- ------------------------------------------------------------
CREATE TABLE notifications (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  title       VARCHAR(150) NOT NULL,
  message     VARCHAR(500) NOT NULL,
  link        VARCHAR(200) NULL,
  due_at      DATETIME NULL,
  read_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user_read (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- record_photos: photos attached to an inspection / work record.
-- Files live in the uploads/ folder; only the file name is stored.
-- ------------------------------------------------------------
CREATE TABLE record_photos (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  record_id   INT UNSIGNED NOT NULL,
  file_name   VARCHAR(80) NOT NULL,
  mime_type   VARCHAR(30) NOT NULL,
  size_bytes  INT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_photos_file (file_name),
  KEY idx_photos_record (record_id),
  CONSTRAINT fk_photos_record FOREIGN KEY (record_id)
    REFERENCES maintenance_records (id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- reviews: an owner rates the caretaker who completed a task.
-- One review per task.
-- ------------------------------------------------------------
CREATE TABLE reviews (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id       INT UNSIGNED NOT NULL,
  owner_id      INT UNSIGNED NOT NULL,
  caretaker_id  INT UNSIGNED NOT NULL,
  rating        TINYINT UNSIGNED NOT NULL,
  comment       VARCHAR(500) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reviews_task (task_id),
  KEY idx_reviews_caretaker (caretaker_id, created_at),
  CONSTRAINT fk_reviews_task FOREIGN KEY (task_id)
    REFERENCES maintenance_tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_owner FOREIGN KEY (owner_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_caretaker FOREIGN KEY (caretaker_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- job_posts: the open job pool. An owner posts a job; caretakers
-- whose service area covers the vehicle can bid on it.
-- ------------------------------------------------------------
CREATE TABLE job_posts (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id        INT UNSIGNED NOT NULL,
  vehicle_id      INT UNSIGNED NOT NULL,
  task_id         INT UNSIGNED NULL,
  title           VARCHAR(120) NOT NULL,
  description     VARCHAR(1000) NULL,
  preferred_date  DATE NULL,
  budget          DECIMAL(10, 2) NULL,
  status          ENUM('open', 'assigned', 'cancelled') NOT NULL DEFAULT 'open',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_jobs_status (status, created_at),
  KEY idx_jobs_owner (owner_id, status),
  KEY idx_jobs_vehicle (vehicle_id),
  KEY idx_jobs_task (task_id),
  CONSTRAINT fk_jobs_owner FOREIGN KEY (owner_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_jobs_vehicle FOREIGN KEY (vehicle_id)
    REFERENCES vehicles (id) ON DELETE CASCADE,
  CONSTRAINT fk_jobs_task FOREIGN KEY (task_id)
    REFERENCES maintenance_tasks (id) ON DELETE SET NULL,
  CONSTRAINT chk_jobs_budget CHECK (budget IS NULL OR budget >= 0)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- job_bids: one bid per caretaker per job.
-- ------------------------------------------------------------
CREATE TABLE job_bids (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id        INT UNSIGNED NOT NULL,
  caretaker_id  INT UNSIGNED NOT NULL,
  price         DECIMAL(10, 2) NOT NULL,
  message       VARCHAR(500) NULL,
  status        ENUM('pending', 'accepted', 'rejected', 'withdrawn') NOT NULL DEFAULT 'pending',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bids_job_caretaker (job_id, caretaker_id),
  KEY idx_bids_caretaker (caretaker_id, status),
  CONSTRAINT fk_bids_job FOREIGN KEY (job_id)
    REFERENCES job_posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_bids_caretaker FOREIGN KEY (caretaker_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_bids_price CHECK (price >= 0)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- ai_messages: AI assistant chat history (per user).
-- ------------------------------------------------------------
CREATE TABLE ai_messages (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  vehicle_id  INT UNSIGNED NULL,
  role        ENUM('user', 'assistant') NOT NULL,
  content     TEXT NOT NULL,
  source      ENUM('gemini', 'rules') NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_user (user_id, id),
  CONSTRAINT fk_ai_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_vehicle FOREIGN KEY (vehicle_id)
    REFERENCES vehicles (id) ON DELETE SET NULL
) ENGINE = InnoDB;
