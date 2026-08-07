-- 3.1 客户对齐演示量测表（P0-1）
-- 依据 docs/data 客户资料：
--   - 结构对齐：measurement_id / psr_id / equip_src_id / equip_type / pos_code(101-108) /
--     measure_type / time_area_type(0-288点/1-1440点) / data_time / 质量码
--   - 数值为确定性演示数据（可复现，不含真实量测值）
--   - 保留 02-init-measurement-demo.sql 的 active_power_measurements 不动（TC09 兼容）
-- 幂等：可重复执行（CREATE IF NOT EXISTS + INSERT ON CONFLICT DO UPDATE）。

CREATE SCHEMA IF NOT EXISTS measurement_demo;

-- ============================================================
-- 1) 主网低频电压曲线（对应资源 GRID-LVF-VOLT-001，l2 明细受控）
--    4 个测点 × 288 个 5 分钟槽位 = 1152 行
-- ============================================================
CREATE TABLE IF NOT EXISTS measurement_demo.grid_low_freq_voltage (
  id bigint PRIMARY KEY,
  measurement_id varchar(64) NOT NULL,
  psr_id varchar(64) NOT NULL,
  equip_src_id varchar(64) NOT NULL,
  equip_type varchar(50) NOT NULL,
  pos_code varchar(10) NOT NULL,
  measure_type varchar(30) NOT NULL,
  time_area_type smallint NOT NULL,
  data_time timestamptz NOT NULL,
  region_code varchar(50) NOT NULL,
  organization_code varchar(50) NOT NULL,
  voltage numeric(12, 4) NOT NULL,
  quality_code varchar(20) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lvf_voltage_measurement
  ON measurement_demo.grid_low_freq_voltage (measurement_id);
CREATE INDEX IF NOT EXISTS idx_lvf_voltage_time
  ON measurement_demo.grid_low_freq_voltage (data_time);
CREATE INDEX IF NOT EXISTS idx_lvf_voltage_scope_time
  ON measurement_demo.grid_low_freq_voltage (organization_code, region_code, data_time);

INSERT INTO measurement_demo.grid_low_freq_voltage (
  id, measurement_id, psr_id, equip_src_id, equip_type, pos_code, measure_type,
  time_area_type, data_time, region_code, organization_code, voltage, quality_code
)
SELECT
  sample_no,
  'MSR-LVF-VOLT-' || lpad(sample_no::text, 6, '0'),
  CASE point_idx
    WHEN 1 THEN 'PSR-220-TRA-01'
    WHEN 2 THEN 'PSR-220-BUS-01'
    WHEN 3 THEN 'PSR-220-LIN-01'
    ELSE 'PSR-110-TRA-02'
  END,
  'SRC-EMS-' || lpad(point_idx::text, 2, '0'),
  CASE point_idx WHEN 1 THEN '主变' WHEN 2 THEN '母线' WHEN 3 THEN '线路' ELSE '主变' END,
  CASE point_idx WHEN 1 THEN '101' WHEN 2 THEN '107' WHEN 3 THEN '108' ELSE '103' END,
  CASE point_idx
    WHEN 1 THEN 'A相电压'
    WHEN 2 THEN 'B相电压'
    WHEN 3 THEN 'C相电压'
    ELSE '线电压AB'
  END,
  0,
  timestamptz '2026-07-01 00:00:00+08' + slot * interval '5 minutes',
  CASE WHEN point_idx <= 2 THEN 'REGION-A' ELSE 'REGION-B' END,
  CASE WHEN point_idx <= 2 THEN 'ORG-A' ELSE 'ORG-B' END,
  round((
    CASE WHEN point_idx = 4 THEN 110 ELSE 220 END
    * (1 + 0.012 * sin(angle) + 0.003 * cos(angle * 3))
    + (sample_no % 11) * 0.01
  )::numeric, 4),
  CASE
    WHEN sample_no % 499 = 0 OR sample_no % 97 = 0 THEN 'invalid'
    WHEN sample_no % 47 = 0 THEN 'suspect'
    ELSE 'normal'
  END
FROM generate_series(1, 1152) AS sample_no
CROSS JOIN LATERAL (VALUES (
  ((sample_no - 1) % 4) + 1,
  ((sample_no - 1) / 4) % 288,
  (((((sample_no - 1) / 4) % 288)::numeric / 288) * 2 * pi())
)) AS v(point_idx, slot, angle)
ON CONFLICT (id) DO UPDATE SET
  measurement_id = EXCLUDED.measurement_id,
  psr_id = EXCLUDED.psr_id,
  equip_src_id = EXCLUDED.equip_src_id,
  equip_type = EXCLUDED.equip_type,
  pos_code = EXCLUDED.pos_code,
  measure_type = EXCLUDED.measure_type,
  time_area_type = EXCLUDED.time_area_type,
  data_time = EXCLUDED.data_time,
  region_code = EXCLUDED.region_code,
  organization_code = EXCLUDED.organization_code,
  voltage = EXCLUDED.voltage,
  quality_code = EXCLUDED.quality_code;

-- ============================================================
-- 2) 主网低频电流曲线（对应资源 GRID-LVF-CURR-002，l2 明细受控）
--    4 个测点 × 288 个 5 分钟槽位 = 1152 行
-- ============================================================
CREATE TABLE IF NOT EXISTS measurement_demo.grid_low_freq_current (
  id bigint PRIMARY KEY,
  measurement_id varchar(64) NOT NULL,
  psr_id varchar(64) NOT NULL,
  equip_src_id varchar(64) NOT NULL,
  equip_type varchar(50) NOT NULL,
  pos_code varchar(10) NOT NULL,
  measure_type varchar(30) NOT NULL,
  time_area_type smallint NOT NULL,
  data_time timestamptz NOT NULL,
  region_code varchar(50) NOT NULL,
  organization_code varchar(50) NOT NULL,
  current numeric(12, 4) NOT NULL,
  quality_code varchar(20) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lvf_current_measurement
  ON measurement_demo.grid_low_freq_current (measurement_id);
CREATE INDEX IF NOT EXISTS idx_lvf_current_time
  ON measurement_demo.grid_low_freq_current (data_time);
CREATE INDEX IF NOT EXISTS idx_lvf_current_scope_time
  ON measurement_demo.grid_low_freq_current (organization_code, region_code, data_time);

INSERT INTO measurement_demo.grid_low_freq_current (
  id, measurement_id, psr_id, equip_src_id, equip_type, pos_code, measure_type,
  time_area_type, data_time, region_code, organization_code, current, quality_code
)
SELECT
  sample_no,
  'MSR-LVF-CURR-' || lpad(sample_no::text, 6, '0'),
  CASE point_idx
    WHEN 1 THEN 'PSR-220-TRA-01'
    WHEN 2 THEN 'PSR-220-BUS-01'
    WHEN 3 THEN 'PSR-220-LIN-01'
    ELSE 'PSR-110-TRA-02'
  END,
  'SRC-EMS-' || lpad(point_idx::text, 2, '0'),
  CASE point_idx WHEN 1 THEN '主变' WHEN 2 THEN '母线' WHEN 3 THEN '线路' ELSE '主变' END,
  CASE point_idx WHEN 1 THEN '101' WHEN 2 THEN '107' WHEN 3 THEN '108' ELSE '103' END,
  CASE point_idx
    WHEN 1 THEN 'A相电流'
    WHEN 2 THEN 'B相电流'
    WHEN 3 THEN 'C相电流'
    ELSE '线电流AB'
  END,
  0,
  timestamptz '2026-07-01 00:00:00+08' + slot * interval '5 minutes',
  CASE WHEN point_idx <= 2 THEN 'REGION-A' ELSE 'REGION-B' END,
  CASE WHEN point_idx <= 2 THEN 'ORG-A' ELSE 'ORG-B' END,
  round((
    CASE point_idx
      WHEN 1 THEN 380
      WHEN 2 THEN 260
      WHEN 3 THEN 480
      ELSE 620
    END
    * (1 + 0.08 * sin(angle) + 0.02 * cos(angle * 2))
    + (sample_no % 9) * 0.35
  )::numeric, 4),
  CASE
    WHEN sample_no % 499 = 0 OR sample_no % 97 = 0 THEN 'invalid'
    WHEN sample_no % 47 = 0 THEN 'suspect'
    ELSE 'normal'
  END
FROM generate_series(1, 1152) AS sample_no
CROSS JOIN LATERAL (VALUES (
  ((sample_no - 1) % 4) + 1,
  ((sample_no - 1) / 4) % 288,
  (((((sample_no - 1) / 4) % 288)::numeric / 288) * 2 * pi())
)) AS v(point_idx, slot, angle)
ON CONFLICT (id) DO UPDATE SET
  measurement_id = EXCLUDED.measurement_id,
  psr_id = EXCLUDED.psr_id,
  equip_src_id = EXCLUDED.equip_src_id,
  equip_type = EXCLUDED.equip_type,
  pos_code = EXCLUDED.pos_code,
  measure_type = EXCLUDED.measure_type,
  time_area_type = EXCLUDED.time_area_type,
  data_time = EXCLUDED.data_time,
  region_code = EXCLUDED.region_code,
  organization_code = EXCLUDED.organization_code,
  current = EXCLUDED.current,
  quality_code = EXCLUDED.quality_code;

-- ============================================================
-- 3) 主网低频功率曲线（对应资源 GRID-LVF-POWER-004，l2 明细受控）
--    4 个测点 × 288 个 5 分钟槽位 = 1152 行
-- ============================================================
CREATE TABLE IF NOT EXISTS measurement_demo.grid_low_freq_power (
  id bigint PRIMARY KEY,
  measurement_id varchar(64) NOT NULL,
  psr_id varchar(64) NOT NULL,
  equip_src_id varchar(64) NOT NULL,
  equip_type varchar(50) NOT NULL,
  pos_code varchar(10) NOT NULL,
  measure_type varchar(30) NOT NULL,
  time_area_type smallint NOT NULL,
  data_time timestamptz NOT NULL,
  region_code varchar(50) NOT NULL,
  organization_code varchar(50) NOT NULL,
  p_active numeric(16, 4) NOT NULL,
  p_reactive numeric(16, 4) NOT NULL,
  quality_code varchar(20) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lvf_power_measurement
  ON measurement_demo.grid_low_freq_power (measurement_id);
CREATE INDEX IF NOT EXISTS idx_lvf_power_time
  ON measurement_demo.grid_low_freq_power (data_time);
CREATE INDEX IF NOT EXISTS idx_lvf_power_scope_time
  ON measurement_demo.grid_low_freq_power (organization_code, region_code, data_time);

INSERT INTO measurement_demo.grid_low_freq_power (
  id, measurement_id, psr_id, equip_src_id, equip_type, pos_code, measure_type,
  time_area_type, data_time, region_code, organization_code,
  p_active, p_reactive, quality_code
)
SELECT
  sample_no,
  'MSR-LVF-POWR-' || lpad(sample_no::text, 6, '0'),
  CASE point_idx
    WHEN 1 THEN 'PSR-220-TRA-01'
    WHEN 2 THEN 'PSR-220-BUS-01'
    WHEN 3 THEN 'PSR-220-LIN-01'
    ELSE 'PSR-110-TRA-02'
  END,
  'SRC-EMS-' || lpad(point_idx::text, 2, '0'),
  CASE point_idx WHEN 1 THEN '主变' WHEN 2 THEN '母线' WHEN 3 THEN '线路' ELSE '主变' END,
  CASE point_idx WHEN 1 THEN '101' WHEN 2 THEN '107' WHEN 3 THEN '108' ELSE '103' END,
  '有功功率',
  0,
  timestamptz '2026-07-01 00:00:00+08' + slot * interval '5 minutes',
  CASE WHEN point_idx <= 2 THEN 'REGION-A' ELSE 'REGION-B' END,
  CASE WHEN point_idx <= 2 THEN 'ORG-A' ELSE 'ORG-B' END,
  round((
    CASE point_idx
      WHEN 1 THEN 86
      WHEN 2 THEN 52
      WHEN 3 THEN 96
      ELSE 118
    END
    * (1 + 0.18 * sin(angle) + 0.04 * cos(angle * 2))
    + (sample_no % 13) * 0.12
  )::numeric, 4),
  round((
    CASE point_idx
      WHEN 1 THEN 21
      WHEN 2 THEN 13
      WHEN 3 THEN 24
      ELSE 29
    END
    * (1 + 0.15 * cos(angle) + 0.03 * sin(angle * 3))
  )::numeric, 4),
  CASE
    WHEN sample_no % 499 = 0 OR sample_no % 97 = 0 THEN 'invalid'
    WHEN sample_no % 47 = 0 THEN 'suspect'
    ELSE 'normal'
  END
FROM generate_series(1, 1152) AS sample_no
CROSS JOIN LATERAL (VALUES (
  ((sample_no - 1) % 4) + 1,
  ((sample_no - 1) / 4) % 288,
  (((((sample_no - 1) / 4) % 288)::numeric / 288) * 2 * pi())
)) AS v(point_idx, slot, angle)
ON CONFLICT (id) DO UPDATE SET
  measurement_id = EXCLUDED.measurement_id,
  psr_id = EXCLUDED.psr_id,
  equip_src_id = EXCLUDED.equip_src_id,
  equip_type = EXCLUDED.equip_type,
  pos_code = EXCLUDED.pos_code,
  measure_type = EXCLUDED.measure_type,
  time_area_type = EXCLUDED.time_area_type,
  data_time = EXCLUDED.data_time,
  region_code = EXCLUDED.region_code,
  organization_code = EXCLUDED.organization_code,
  p_active = EXCLUDED.p_active,
  p_reactive = EXCLUDED.p_reactive,
  quality_code = EXCLUDED.quality_code;

-- ============================================================
-- 4) 低频功率因数曲线（对应资源 GRID-LVF-PF-006，l1 仅聚合）
--    2 个测点 × 288 个 5 分钟槽位 = 576 行
-- ============================================================
CREATE TABLE IF NOT EXISTS measurement_demo.grid_low_freq_power_factor (
  id bigint PRIMARY KEY,
  measurement_id varchar(64) NOT NULL,
  psr_id varchar(64) NOT NULL,
  equip_src_id varchar(64) NOT NULL,
  equip_type varchar(50) NOT NULL,
  pos_code varchar(10) NOT NULL,
  measure_type varchar(30) NOT NULL,
  time_area_type smallint NOT NULL,
  data_time timestamptz NOT NULL,
  region_code varchar(50) NOT NULL,
  organization_code varchar(50) NOT NULL,
  power_factor numeric(8, 4) NOT NULL,
  quality_code varchar(20) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lvf_pf_measurement
  ON measurement_demo.grid_low_freq_power_factor (measurement_id);
CREATE INDEX IF NOT EXISTS idx_lvf_pf_time
  ON measurement_demo.grid_low_freq_power_factor (data_time);
CREATE INDEX IF NOT EXISTS idx_lvf_pf_scope_time
  ON measurement_demo.grid_low_freq_power_factor (organization_code, region_code, data_time);

INSERT INTO measurement_demo.grid_low_freq_power_factor (
  id, measurement_id, psr_id, equip_src_id, equip_type, pos_code, measure_type,
  time_area_type, data_time, region_code, organization_code, power_factor, quality_code
)
SELECT
  sample_no,
  'MSR-LVF-PF-' || lpad(sample_no::text, 6, '0'),
  CASE point_idx WHEN 1 THEN 'PSR-220-LIN-01' ELSE 'PSR-110-LIN-02' END,
  'SRC-EMS-' || lpad(point_idx::text, 2, '0'),
  '线路',
  CASE point_idx WHEN 1 THEN '107' ELSE '108' END,
  '功率因数',
  0,
  timestamptz '2026-07-01 00:00:00+08' + slot * interval '5 minutes',
  CASE WHEN point_idx = 1 THEN 'REGION-A' ELSE 'REGION-B' END,
  CASE WHEN point_idx = 1 THEN 'ORG-A' ELSE 'ORG-B' END,
  round((
    0.95
    - 0.06 * (1 + sin(angle + 0.4))
    * (1 + 0.5 * sin(angle * 3))
    + (sample_no % 7) * 0.002
  )::numeric, 4),
  CASE
    WHEN sample_no % 499 = 0 OR sample_no % 97 = 0 THEN 'invalid'
    WHEN sample_no % 47 = 0 THEN 'suspect'
    ELSE 'normal'
  END
FROM generate_series(1, 576) AS sample_no
CROSS JOIN LATERAL (VALUES (
  ((sample_no - 1) % 2) + 1,
  ((sample_no - 1) / 2) % 288,
  (((((sample_no - 1) / 2) % 288)::numeric / 288) * 2 * pi())
)) AS v(point_idx, slot, angle)
ON CONFLICT (id) DO UPDATE SET
  measurement_id = EXCLUDED.measurement_id,
  psr_id = EXCLUDED.psr_id,
  equip_src_id = EXCLUDED.equip_src_id,
  equip_type = EXCLUDED.equip_type,
  pos_code = EXCLUDED.pos_code,
  measure_type = EXCLUDED.measure_type,
  time_area_type = EXCLUDED.time_area_type,
  data_time = EXCLUDED.data_time,
  region_code = EXCLUDED.region_code,
  organization_code = EXCLUDED.organization_code,
  power_factor = EXCLUDED.power_factor,
  quality_code = EXCLUDED.quality_code;

-- ============================================================
-- 5) 用户日冻结电能示值（对应资源 CUST-DAILY-ENERGY-003，l3 仅密态）
--    64 个用户 × 8 天 = 512 行；字段对齐客户 o-esp-empreadday 结构（pap_r/pap_r1-4/prp_r）
-- ============================================================
CREATE TABLE IF NOT EXISTS measurement_demo.cust_daily_frozen_energy (
  id bigint PRIMARY KEY,
  measurement_id varchar(64) NOT NULL,
  cons_no varchar(32) NOT NULL,
  meter_dev_id varchar(32) NOT NULL,
  mgt_org_code varchar(50) NOT NULL,
  equip_type varchar(50) NOT NULL,
  pos_code varchar(10) NOT NULL,
  data_date date NOT NULL,
  pap_r bigint NOT NULL,
  pap_r1 bigint NOT NULL,
  pap_r2 bigint NOT NULL,
  pap_r3 bigint NOT NULL,
  pap_r4 bigint NOT NULL,
  prp_r bigint NOT NULL,
  region_code varchar(50) NOT NULL,
  organization_code varchar(50) NOT NULL,
  quality_code varchar(20) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_frozen_measurement
  ON measurement_demo.cust_daily_frozen_energy (measurement_id);
CREATE INDEX IF NOT EXISTS idx_frozen_cons_date
  ON measurement_demo.cust_daily_frozen_energy (cons_no, data_date);
CREATE INDEX IF NOT EXISTS idx_frozen_scope_date
  ON measurement_demo.cust_daily_frozen_energy (organization_code, region_code, data_date);

INSERT INTO measurement_demo.cust_daily_frozen_energy (
  id, measurement_id, cons_no, meter_dev_id, mgt_org_code, equip_type, pos_code,
  data_date, pap_r, pap_r1, pap_r2, pap_r3, pap_r4, prp_r,
  region_code, organization_code, quality_code
)
SELECT
  sample_no,
  'MSR-FRZN-' || lpad(sample_no::text, 6, '0'),
  'C' || lpad(cust_idx::text, 8, '0'),
  'MTR-' || lpad(cust_idx::text, 6, '0') || '-' || lpad((day_idx + 1)::text, 2, '0'),
  CASE WHEN cust_idx <= 32 THEN 'ORG-A' ELSE 'ORG-B' END,
  CASE cust_idx % 4
    WHEN 0 THEN '低压用户'
    WHEN 1 THEN '中压用户'
    WHEN 2 THEN '分布式光伏'
    ELSE '充电桩'
  END,
  CASE WHEN cust_idx % 4 = 1 THEN '102' ELSE '103' END,
  date '2026-06-24' + day_idx,
  energy.pap_r,
  (energy.pap_r * 0.25)::bigint,
  (energy.pap_r * 0.35)::bigint,
  (energy.pap_r * 0.30)::bigint,
  (energy.pap_r * 0.10)::bigint,
  (energy.pap_r * 0.18)::bigint,
  CASE WHEN cust_idx <= 32 THEN 'REGION-A' ELSE 'REGION-B' END,
  CASE WHEN cust_idx <= 32 THEN 'ORG-A' ELSE 'ORG-B' END,
  CASE
    WHEN sample_no % 499 = 0 OR sample_no % 97 = 0 THEN 'invalid'
    WHEN sample_no % 47 = 0 THEN 'suspect'
    ELSE 'normal'
  END
FROM generate_series(1, 512) AS sample_no
CROSS JOIN LATERAL (VALUES (
  ((sample_no - 1) % 64) + 1,
  (sample_no - 1) / 64
)) AS idx(cust_idx, day_idx)
CROSS JOIN LATERAL (VALUES (
  (200 + day_idx * 25 + (cust_idx % 7) * 9 + round(sin(day_idx::numeric / 8 * 2 * pi()) * 10))::bigint
)) AS energy(pap_r)
ON CONFLICT (id) DO UPDATE SET
  measurement_id = EXCLUDED.measurement_id,
  cons_no = EXCLUDED.cons_no,
  meter_dev_id = EXCLUDED.meter_dev_id,
  mgt_org_code = EXCLUDED.mgt_org_code,
  equip_type = EXCLUDED.equip_type,
  pos_code = EXCLUDED.pos_code,
  data_date = EXCLUDED.data_date,
  pap_r = EXCLUDED.pap_r,
  pap_r1 = EXCLUDED.pap_r1,
  pap_r2 = EXCLUDED.pap_r2,
  pap_r3 = EXCLUDED.pap_r3,
  pap_r4 = EXCLUDED.pap_r4,
  prp_r = EXCLUDED.prp_r,
  region_code = EXCLUDED.region_code,
  organization_code = EXCLUDED.organization_code,
  quality_code = EXCLUDED.quality_code;

-- ============================================================
-- 6) 用户量测曲线（对应资源 CUST-POWER-CURVE-005，l3 仅密态）
--    2 个用户点 × 288 槽位 = 576 行；A/B/C 相电压电流、有功、无功、功率因数
-- ============================================================
CREATE TABLE IF NOT EXISTS measurement_demo.cust_measurement_curve (
  id bigint PRIMARY KEY,
  measurement_id varchar(64) NOT NULL,
  cons_no varchar(32) NOT NULL,
  meter_dev_id varchar(32) NOT NULL,
  equip_type varchar(50) NOT NULL,
  pos_code varchar(10) NOT NULL,
  measure_type varchar(30) NOT NULL,
  time_area_type smallint NOT NULL,
  data_time timestamptz NOT NULL,
  region_code varchar(50) NOT NULL,
  organization_code varchar(50) NOT NULL,
  value numeric(18, 6) NOT NULL,
  quality_code varchar(20) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cust_curve_measurement
  ON measurement_demo.cust_measurement_curve (measurement_id);
CREATE INDEX IF NOT EXISTS idx_cust_curve_time
  ON measurement_demo.cust_measurement_curve (data_time);
CREATE INDEX IF NOT EXISTS idx_cust_curve_scope_time
  ON measurement_demo.cust_measurement_curve (organization_code, region_code, data_time);

INSERT INTO measurement_demo.cust_measurement_curve (
  id, measurement_id, cons_no, meter_dev_id, equip_type, pos_code, measure_type,
  time_area_type, data_time, region_code, organization_code, value, quality_code
)
SELECT
  sample_no,
  'MSR-CUST-CURVE-' || lpad(sample_no::text, 6, '0'),
  'C' || lpad(((sample_no - 1) % 32 + 1)::text, 8, '0'),
  'MTR-' || lpad(((sample_no - 1) % 32 + 1)::text, 6, '0'),
  CASE point_idx WHEN 1 THEN '低压用户' ELSE '分布式光伏' END,
  CASE point_idx WHEN 1 THEN '103' ELSE '102' END,
  CASE measure_kind
    WHEN 0 THEN 'A相电压'
    WHEN 1 THEN 'B相电压'
    WHEN 2 THEN 'C相电压'
    WHEN 3 THEN 'A相电流'
    WHEN 4 THEN 'B相电流'
    WHEN 5 THEN 'C相电流'
    WHEN 6 THEN '有功功率'
    WHEN 7 THEN '无功功率'
    ELSE '功率因数'
  END,
  0,
  timestamptz '2026-07-01 00:00:00+08' + slot * interval '5 minutes',
  CASE WHEN point_idx = 1 THEN 'REGION-A' ELSE 'REGION-B' END,
  CASE WHEN point_idx = 1 THEN 'ORG-A' ELSE 'ORG-B' END,
  round((
    CASE
      WHEN point_idx = 1 AND measure_kind < 3 THEN 0.22
      WHEN point_idx = 1 AND measure_kind < 6 THEN 15
      WHEN point_idx = 1 AND measure_kind = 6 THEN 4
      WHEN point_idx = 1 AND measure_kind = 7 THEN 1.2
      WHEN point_idx = 1 THEN 0.95
      WHEN point_idx = 2 AND measure_kind < 3 THEN 0.38
      WHEN point_idx = 2 AND measure_kind < 6 THEN 40
      WHEN point_idx = 2 AND measure_kind = 6 THEN 12
      WHEN point_idx = 2 AND measure_kind = 7 THEN 3.1
      ELSE 0.92
    END
    * (1 + 0.05 * sin(angle) + 0.02 * cos(angle * 2))
    + (sample_no % 13) * 0.01
  )::numeric, 6),
  CASE
    WHEN sample_no % 499 = 0 OR sample_no % 97 = 0 THEN 'invalid'
    WHEN sample_no % 47 = 0 THEN 'suspect'
    ELSE 'normal'
  END
FROM generate_series(1, 576) AS sample_no
CROSS JOIN LATERAL (VALUES (
  ((sample_no - 1) % 2) + 1,
  ((sample_no - 1) / 2) % 288,
  (((((sample_no - 1) / 2) % 288)::numeric / 288) * 2 * pi()),
  (sample_no % 9)
)) AS v(point_idx, slot, angle, measure_kind)
ON CONFLICT (id) DO UPDATE SET
  measurement_id = EXCLUDED.measurement_id,
  cons_no = EXCLUDED.cons_no,
  meter_dev_id = EXCLUDED.meter_dev_id,
  equip_type = EXCLUDED.equip_type,
  pos_code = EXCLUDED.pos_code,
  measure_type = EXCLUDED.measure_type,
  time_area_type = EXCLUDED.time_area_type,
  data_time = EXCLUDED.data_time,
  region_code = EXCLUDED.region_code,
  organization_code = EXCLUDED.organization_code,
  value = EXCLUDED.value,
  quality_code = EXCLUDED.quality_code;

-- ============================================================
-- 7) 用户停复电事件（对应资源 CUST-OUTAGE-EVENT-007，l3 仅密态）
--    384 条事件
-- ============================================================
CREATE TABLE IF NOT EXISTS measurement_demo.cust_outage_events (
  id bigint PRIMARY KEY,
  event_id varchar(64) NOT NULL,
  cons_no varchar(32) NOT NULL,
  meter_dev_id varchar(32) NOT NULL,
  equip_type varchar(50) NOT NULL,
  pos_code varchar(10) NOT NULL,
  event_type varchar(20) NOT NULL,
  event_time timestamptz NOT NULL,
  event_source varchar(50) NOT NULL,
  outage_duration_min numeric(12, 2),
  region_code varchar(50) NOT NULL,
  organization_code varchar(50) NOT NULL,
  quality_code varchar(20) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_outage_event
  ON measurement_demo.cust_outage_events (event_id);
CREATE INDEX IF NOT EXISTS idx_outage_event_time
  ON measurement_demo.cust_outage_events (event_time);
CREATE INDEX IF NOT EXISTS idx_outage_scope_time
  ON measurement_demo.cust_outage_events (organization_code, region_code, event_time);

INSERT INTO measurement_demo.cust_outage_events (
  id, event_id, cons_no, meter_dev_id, equip_type, pos_code, event_type,
  event_time, event_source, outage_duration_min, region_code, organization_code, quality_code
)
SELECT
  sample_no,
  'EVT-CUST-' || lpad(sample_no::text, 6, '0'),
  'C' || lpad(((sample_no - 1) % 64 + 1)::text, 8, '0'),
  'MTR-' || lpad(((sample_no - 1) % 64 + 1)::text, 6, '0'),
  CASE ((sample_no - 1) % 64) % 4
    WHEN 0 THEN '低压用户'
    WHEN 1 THEN '中压用户'
    WHEN 2 THEN '分布式光伏'
    ELSE '充电桩'
  END,
  CASE ((sample_no - 1) % 64) % 4 WHEN 1 THEN '102' ELSE '103' END,
  CASE WHEN sample_no % 2 = 1 THEN '停电' ELSE '复电' END,
  timestamptz '2026-07-01 00:00:00+08' + sample_no * interval '45 minutes',
  CASE WHEN sample_no % 4 = 0 THEN '配电自动化' ELSE '用采2.0' END,
  CASE WHEN sample_no % 2 = 1 THEN ((sample_no % 180) + 5)::numeric ELSE NULL END,
  CASE WHEN ((sample_no - 1) % 64) < 32 THEN 'REGION-A' ELSE 'REGION-B' END,
  CASE WHEN ((sample_no - 1) % 64) < 32 THEN 'ORG-A' ELSE 'ORG-B' END,
  CASE
    WHEN sample_no % 499 = 0 OR sample_no % 97 = 0 THEN 'invalid'
    WHEN sample_no % 47 = 0 THEN 'suspect'
    ELSE 'normal'
  END
FROM generate_series(1, 384) AS sample_no
ON CONFLICT (id) DO UPDATE SET
  event_id = EXCLUDED.event_id,
  cons_no = EXCLUDED.cons_no,
  meter_dev_id = EXCLUDED.meter_dev_id,
  equip_type = EXCLUDED.equip_type,
  pos_code = EXCLUDED.pos_code,
  event_type = EXCLUDED.event_type,
  event_time = EXCLUDED.event_time,
  event_source = EXCLUDED.event_source,
  outage_duration_min = EXCLUDED.outage_duration_min,
  region_code = EXCLUDED.region_code,
  organization_code = EXCLUDED.organization_code,
  quality_code = EXCLUDED.quality_code;

-- ============================================================
-- 8) 开关变位事件（对应资源 GRID-SWITCH-EVENT-008，l2 明细受控）
--    384 条事件
-- ============================================================
CREATE TABLE IF NOT EXISTS measurement_demo.grid_switch_events (
  id bigint PRIMARY KEY,
  event_id varchar(64) NOT NULL,
  psr_id varchar(64) NOT NULL,
  equip_src_id varchar(64) NOT NULL,
  equip_type varchar(50) NOT NULL,
  pos_code varchar(10) NOT NULL,
  event_type varchar(30) NOT NULL,
  switch_state smallint NOT NULL,
  event_time timestamptz NOT NULL,
  region_code varchar(50) NOT NULL,
  organization_code varchar(50) NOT NULL,
  quality_code varchar(20) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_switch_event
  ON measurement_demo.grid_switch_events (event_id);
CREATE INDEX IF NOT EXISTS idx_switch_event_time
  ON measurement_demo.grid_switch_events (event_time);
CREATE INDEX IF NOT EXISTS idx_switch_scope_time
  ON measurement_demo.grid_switch_events (organization_code, region_code, event_time);

INSERT INTO measurement_demo.grid_switch_events (
  id, event_id, psr_id, equip_src_id, equip_type, pos_code, event_type,
  switch_state, event_time, region_code, organization_code, quality_code
)
SELECT
  sample_no,
  'EVT-GRID-' || lpad(sample_no::text, 6, '0'),
  'PSR-SW-' || lpad(((sample_no - 1) % 24 + 1)::text, 3, '0'),
  'SRC-DMS-' || lpad(((sample_no - 1) % 24 + 1)::text, 2, '0'),
  CASE ((sample_no - 1) % 24) % 3
    WHEN 0 THEN '断路器'
    WHEN 1 THEN '负荷开关'
    ELSE '柱上开关'
  END,
  CASE ((sample_no - 1) % 24) % 3 WHEN 2 THEN '107' ELSE '108' END,
  CASE sample_no % 5
    WHEN 0 THEN '开关变位'
    WHEN 1 THEN '开关变位'
    WHEN 2 THEN '开关变位'
    WHEN 3 THEN '故障跳闸'
    ELSE '事故总'
  END,
  CASE WHEN sample_no % 2 = 0 THEN 1 ELSE 0 END,
  timestamptz '2026-07-01 00:00:00+08' + sample_no * interval '50 minutes',
  CASE WHEN ((sample_no - 1) % 24) < 12 THEN 'REGION-A' ELSE 'REGION-B' END,
  CASE WHEN ((sample_no - 1) % 24) < 12 THEN 'ORG-A' ELSE 'ORG-B' END,
  CASE
    WHEN sample_no % 499 = 0 OR sample_no % 97 = 0 THEN 'invalid'
    WHEN sample_no % 47 = 0 THEN 'suspect'
    ELSE 'normal'
  END
FROM generate_series(1, 384) AS sample_no
ON CONFLICT (id) DO UPDATE SET
  event_id = EXCLUDED.event_id,
  psr_id = EXCLUDED.psr_id,
  equip_src_id = EXCLUDED.equip_src_id,
  equip_type = EXCLUDED.equip_type,
  pos_code = EXCLUDED.pos_code,
  event_type = EXCLUDED.event_type,
  switch_state = EXCLUDED.switch_state,
  event_time = EXCLUDED.event_time,
  region_code = EXCLUDED.region_code,
  organization_code = EXCLUDED.organization_code,
  quality_code = EXCLUDED.quality_code;

-- ============================================================
-- 9) 未关联量测归档（对应资源 GRID-NO-RELAD-009，l1 仅聚合/密态）
--    客户 *_NO_RELAD 未关联表的演示：无设备档案关联（无 psr_id/equip_type），仅允许聚合或密态输出
--    256 行
-- ============================================================
CREATE TABLE IF NOT EXISTS measurement_demo.measurement_no_relad (
  id bigint PRIMARY KEY,
  measurement_id varchar(64) NOT NULL,
  source_tag varchar(50) NOT NULL,
  measure_type varchar(30) NOT NULL,
  time_area_type smallint NOT NULL,
  data_time timestamptz NOT NULL,
  region_code varchar(50) NOT NULL,
  organization_code varchar(50) NOT NULL,
  value numeric(18, 6) NOT NULL,
  quality_code varchar(20) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_no_relad_measurement
  ON measurement_demo.measurement_no_relad (measurement_id);
CREATE INDEX IF NOT EXISTS idx_no_relad_time
  ON measurement_demo.measurement_no_relad (data_time);
CREATE INDEX IF NOT EXISTS idx_no_relad_scope_time
  ON measurement_demo.measurement_no_relad (organization_code, region_code, data_time);

INSERT INTO measurement_demo.measurement_no_relad (
  id, measurement_id, source_tag, measure_type, time_area_type, data_time,
  region_code, organization_code, value, quality_code
)
SELECT
  sample_no,
  'MSR-NORELAD-' || lpad(sample_no::text, 6, '0'),
  CASE sample_no % 3 WHEN 0 THEN '主网遥测' WHEN 1 THEN '配网遥测' ELSE '用户量测' END,
  CASE sample_no % 4 WHEN 0 THEN '电压' WHEN 1 THEN '电流' WHEN 2 THEN '有功' ELSE '无功' END,
  CASE WHEN sample_no % 2 = 0 THEN 0 ELSE 1 END,
  timestamptz '2026-07-01 00:00:00+08' + ((sample_no - 1) % 96) * interval '15 minutes',
  CASE WHEN sample_no % 2 = 1 THEN 'REGION-A' ELSE 'REGION-B' END,
  CASE WHEN sample_no % 2 = 1 THEN 'ORG-A' ELSE 'ORG-B' END,
  round((
    50 + (sample_no % 37) * 3.7 + sin(((sample_no - 1) % 96)::numeric / 96 * 2 * pi()) * 20
  )::numeric, 6),
  CASE
    WHEN sample_no % 499 = 0 OR sample_no % 97 = 0 THEN 'invalid'
    WHEN sample_no % 47 = 0 THEN 'suspect'
    ELSE 'normal'
  END
FROM generate_series(1, 256) AS sample_no
ON CONFLICT (id) DO UPDATE SET
  measurement_id = EXCLUDED.measurement_id,
  source_tag = EXCLUDED.source_tag,
  measure_type = EXCLUDED.measure_type,
  time_area_type = EXCLUDED.time_area_type,
  data_time = EXCLUDED.data_time,
  region_code = EXCLUDED.region_code,
  organization_code = EXCLUDED.organization_code,
  value = EXCLUDED.value,
  quality_code = EXCLUDED.quality_code;

-- ============================================================
-- 10) 主网电能示值（对应资源 GRID-TMR-ENERGY-010，l2 明细受控）
--    32 个设备 × 16 天 = 512 行
-- ============================================================
CREATE TABLE IF NOT EXISTS measurement_demo.grid_tmr_energy (
  id bigint PRIMARY KEY,
  measurement_id varchar(64) NOT NULL,
  psr_id varchar(64) NOT NULL,
  equip_type varchar(50) NOT NULL,
  pos_code varchar(10) NOT NULL,
  energy_type varchar(30) NOT NULL,
  read_value numeric(20, 4) NOT NULL,
  data_time timestamptz NOT NULL,
  region_code varchar(50) NOT NULL,
  organization_code varchar(50) NOT NULL,
  quality_code varchar(20) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tmr_measurement
  ON measurement_demo.grid_tmr_energy (measurement_id);
CREATE INDEX IF NOT EXISTS idx_tmr_time
  ON measurement_demo.grid_tmr_energy (data_time);
CREATE INDEX IF NOT EXISTS idx_tmr_scope_time
  ON measurement_demo.grid_tmr_energy (organization_code, region_code, data_time);

INSERT INTO measurement_demo.grid_tmr_energy (
  id, measurement_id, psr_id, equip_type, pos_code, energy_type, read_value,
  data_time, region_code, organization_code, quality_code
)
SELECT
  sample_no,
  'MSR-TMR-' || lpad(sample_no::text, 6, '0'),
  'PSR-TMR-' || lpad(dev_idx::text, 3, '0'),
  CASE dev_idx % 4 WHEN 0 THEN '主变' WHEN 1 THEN '断路器' WHEN 2 THEN '机组' ELSE '线路' END,
  CASE dev_idx % 4 WHEN 2 THEN '101' WHEN 0 THEN '101' ELSE '102' END,
  CASE dev_idx % 4
    WHEN 0 THEN '正向有功'
    WHEN 1 THEN '反向有功'
    WHEN 2 THEN '正向无功'
    ELSE '反向无功'
  END,
  round((
    50000 + day_idx * 1800 + (dev_idx % 9) * 320 + sin(day_idx::numeric / 16 * 2 * pi()) * 600
  )::numeric, 4),
  timestamptz '2026-06-16 00:00:00+08' + day_idx * interval '1 day',
  CASE WHEN dev_idx <= 16 THEN 'REGION-A' ELSE 'REGION-B' END,
  CASE WHEN dev_idx <= 16 THEN 'ORG-A' ELSE 'ORG-B' END,
  CASE
    WHEN sample_no % 499 = 0 OR sample_no % 97 = 0 THEN 'invalid'
    WHEN sample_no % 47 = 0 THEN 'suspect'
    ELSE 'normal'
  END
FROM generate_series(1, 512) AS sample_no
CROSS JOIN LATERAL (VALUES (
  ((sample_no - 1) % 32) + 1,
  (sample_no - 1) / 32
)) AS idx(dev_idx, day_idx)
ON CONFLICT (id) DO UPDATE SET
  measurement_id = EXCLUDED.measurement_id,
  psr_id = EXCLUDED.psr_id,
  equip_type = EXCLUDED.equip_type,
  pos_code = EXCLUDED.pos_code,
  energy_type = EXCLUDED.energy_type,
  read_value = EXCLUDED.read_value,
  data_time = EXCLUDED.data_time,
  region_code = EXCLUDED.region_code,
  organization_code = EXCLUDED.organization_code,
  quality_code = EXCLUDED.quality_code;

-- ============================================================
-- 表说明
-- ============================================================
COMMENT ON TABLE measurement_demo.grid_low_freq_voltage IS '3.1 主网低频电压曲线演示数据（1152 行，5 分钟采样，结构对齐客户低频电压曲线）。';
COMMENT ON TABLE measurement_demo.grid_low_freq_current IS '3.1 主网低频电流曲线演示数据（1152 行，5 分钟采样）。';
COMMENT ON TABLE measurement_demo.grid_low_freq_power IS '3.1 主网低频功率曲线演示数据（1152 行，5 分钟采样）。';
COMMENT ON TABLE measurement_demo.grid_low_freq_power_factor IS '3.1 低频功率因数曲线演示数据（576 行）。';
COMMENT ON TABLE measurement_demo.cust_daily_frozen_energy IS '3.1 用户日冻结电能示值演示数据（512 行，结构对齐客户日冻结表）。';
COMMENT ON TABLE measurement_demo.cust_measurement_curve IS '3.1 用户量测曲线演示数据（576 行，A/B/C 相电压电流与功率）。';
COMMENT ON TABLE measurement_demo.cust_outage_events IS '3.1 用户停复电事件演示数据（384 条）。';
COMMENT ON TABLE measurement_demo.grid_switch_events IS '3.1 开关变位事件演示数据（384 条）。';
COMMENT ON TABLE measurement_demo.measurement_no_relad IS '3.1 未关联量测归档演示数据（256 行，无设备档案关联，仅允许聚合或密态输出）。';
COMMENT ON TABLE measurement_demo.grid_tmr_energy IS '3.1 主网电能示值演示数据（512 行）。';
